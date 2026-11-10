package br.com.altomax.separa.datawedge

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.UUID

/**
 * Ponte mínima com o DataWedge dos coletores Zebra (TC21). O app continua recebendo a
 * leitura como teclado (perfil do DataWedge em keystroke output); este módulo só:
 *
 *  - diz se o DataWedge existe no aparelho (= é um coletor Zebra, o botão "Leitor" só
 *    aparece aí);
 *  - descobre o perfil ativo (GET_ACTIVE_PROFILE) e muda nele os parâmetros do leitor
 *    (SET_CONFIG, só os campos abaixo, RESET_CONFIG=false — o resto do perfil fica);
 *  - liga e desliga o feixe pelo soft scan trigger (START_SCANNING / STOP_SCANNING).
 *
 * Leitura contínua = aim_type 5 (Continuous Read) + beam_timer 0 (não apaga sozinho):
 * com isso START_SCANNING deixa o leitor ligado até o STOP_SCANNING. same_barcode_timeout
 * é o "mesmo código só repete depois de N ms" (igual à câmera contínua do app). Ao
 * desligar, o perfil volta para aim_type 0 (Trigger) e beam_timer 5000, os padrões do
 * DataWedge — se o coletor tinha outro valor configurado à mão, ele é perdido.
 *
 * Tudo é broadcast; a resposta do DataWedge chega em RESULT_ACTION, por isso as funções
 * que precisam de resposta registram um receiver temporário com timeout.
 */
class DataWedgeModule : Module() {
  companion object {
    const val PACOTE = "com.symbol.datawedge"
    const val ACTION = "com.symbol.datawedge.api.ACTION"
    const val RESULT_ACTION = "com.symbol.datawedge.api.RESULT_ACTION"
    const val EXTRA_SOFT_SCAN = "com.symbol.datawedge.api.SOFT_SCAN_TRIGGER"
    const val EXTRA_SET_CONFIG = "com.symbol.datawedge.api.SET_CONFIG"
    const val EXTRA_GET_ACTIVE_PROFILE = "com.symbol.datawedge.api.GET_ACTIVE_PROFILE"
    const val EXTRA_RESULT_GET_ACTIVE_PROFILE = "com.symbol.datawedge.api.RESULT_GET_ACTIVE_PROFILE"
    const val TIMEOUT_MS = 2000L
  }

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("DataWedge")

    Function("temDataWedge") { temDataWedge() }

    AsyncFunction("perfilAtivo") { promise: Promise ->
      val intent = Intent(ACTION).putExtra(EXTRA_GET_ACTIVE_PROFILE, "")
      enviarEEsperar(intent, { it.hasExtra(EXTRA_RESULT_GET_ACTIVE_PROFILE) }) { resposta ->
        promise.resolve(resposta?.getStringExtra(EXTRA_RESULT_GET_ACTIVE_PROFILE))
      }
    }

    AsyncFunction("configurarLeituraContinua") { perfil: String, mesmoCodigoMs: Int, promise: Promise ->
      val params = Bundle().apply {
        putString("aim_type", "5")                              // Continuous Read
        putString("beam_timer", "0")                            // feixe não apaga sozinho
        putString("same_barcode_timeout", mesmoCodigoMs.toString())
        putString("different_barcode_timeout", "0")
      }
      setConfig(perfil, params, promise)
    }

    AsyncFunction("restaurarGatilho") { perfil: String, promise: Promise ->
      val params = Bundle().apply {
        putString("aim_type", "0")                              // Trigger (padrão)
        putString("beam_timer", "5000")                         // padrão do DataWedge
      }
      setConfig(perfil, params, promise)
    }

    Function("iniciarLeitura") { softScan("START_SCANNING") }
    Function("pararLeitura") { softScan("STOP_SCANNING") }
  }

  private fun temDataWedge(): Boolean = try {
    context.packageManager.getPackageInfo(PACOTE, 0)
    true
  } catch (e: PackageManager.NameNotFoundException) {
    false
  } catch (e: Exception) {
    false
  }

  private fun softScan(comando: String): Boolean = try {
    context.sendBroadcast(Intent(ACTION).putExtra(EXTRA_SOFT_SCAN, comando))
    true
  } catch (e: Exception) {
    false
  }

  /** SET_CONFIG no perfil dado, só com os parâmetros do plugin BARCODE informados. */
  private fun setConfig(perfil: String, params: Bundle, promise: Promise) {
    val id = UUID.randomUUID().toString()
    val barcode = Bundle().apply {
      putString("PLUGIN_NAME", "BARCODE")
      putString("RESET_CONFIG", "false")
      putBundle("PARAM_LIST", params)
    }
    val profile = Bundle().apply {
      putString("PROFILE_NAME", perfil)
      putString("PROFILE_ENABLED", "true")
      putString("CONFIG_MODE", "UPDATE")
      putBundle("PLUGIN_CONFIG", barcode)
    }
    val intent = Intent(ACTION)
      .putExtra(EXTRA_SET_CONFIG, profile)
      .putExtra("SEND_RESULT", "true")
      .putExtra("COMMAND_IDENTIFIER", id)
    enviarEEsperar(intent, { it.getStringExtra("COMMAND_IDENTIFIER") == id }) { resposta ->
      promise.resolve(resposta?.getStringExtra("RESULT") == "SUCCESS")
    }
  }

  /**
   * Manda o broadcast e espera a resposta em RESULT_ACTION que satisfaça `aceita`;
   * sem resposta em TIMEOUT_MS devolve null. Receiver é registrado só durante a espera.
   */
  private fun enviarEEsperar(intent: Intent, aceita: (Intent) -> Boolean, aoTerminar: (Intent?) -> Unit) {
    val ctx: Context
    try {
      ctx = context
    } catch (e: Exception) {
      aoTerminar(null)
      return
    }
    val handler = Handler(Looper.getMainLooper())
    var terminado = false
    var receiver: BroadcastReceiver? = null
    val encerrar: (Intent?) -> Unit = { resposta ->
      if (!terminado) {
        terminado = true
        try { receiver?.let { ctx.unregisterReceiver(it) } } catch (e: Exception) { /* já saiu */ }
        aoTerminar(resposta)
      }
    }
    receiver = object : BroadcastReceiver() {
      override fun onReceive(c: Context?, recebido: Intent?) {
        if (recebido != null && aceita(recebido)) encerrar(recebido)
      }
    }
    val filtro = IntentFilter(RESULT_ACTION).apply { addCategory(Intent.CATEGORY_DEFAULT) }
    try {
      if (Build.VERSION.SDK_INT >= 33) {
        ctx.registerReceiver(receiver, filtro, Context.RECEIVER_EXPORTED)
      } else {
        ctx.registerReceiver(receiver, filtro)
      }
      ctx.sendBroadcast(intent)
    } catch (e: Exception) {
      encerrar(null)
      return
    }
    handler.postDelayed({ encerrar(null) }, TIMEOUT_MS)
  }
}
