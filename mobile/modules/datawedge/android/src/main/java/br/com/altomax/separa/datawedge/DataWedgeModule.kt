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
import android.util.Log
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
 *  - mantém o feixe aceso enquanto o "Leitor" estiver ligado (`ligarVigia`): registra a
 *    notificação SCANNER_STATUS e, toda vez que o scanner volta a WAITING (feixe apagado),
 *    manda START_SCANNING de novo.
 *
 * Por que vigiar em vez de confiar no Continuous Read: visto no TC21 real (2026-11-10) que
 * (1) o DataWedge recarrega o perfil ~15 ms depois de responder SUCCESS ao SET_CONFIG e
 * desliga/religa o scanner por ~750 ms, engolindo um START mandado nesse intervalo; e (2) em
 * parte dos coletores o aim_type 5 (Continuous Read) não entra em vigor mesmo com SUCCESS —
 * o feixe acende, decodifica uma vez e apaga (modo Trigger). Religando a cada WAITING o
 * resultado é o mesmo nos dois casos, e também cobre o gatilho físico apertado com o leitor
 * ligado (que cancela o feixe). same_barcode_timeout continua configurado para quem respeita;
 * o app repete a trava do "mesmo código só depois de N ms" por conta própria.
 *
 * Ao desligar, o perfil volta para aim_type 0 (Trigger) e beam_timer 5000, os padrões do
 * DataWedge — se o coletor tinha outro valor configurado à mão, ele é perdido.
 *
 * Tudo é broadcast; a resposta do DataWedge chega em RESULT_ACTION (receiver temporário
 * com timeout) e o status do scanner em NOTIFICATION_ACTION (receiver que vive enquanto a
 * vigia está ligada).
 */
class DataWedgeModule : Module() {
  companion object {
    const val PACOTE = "com.symbol.datawedge"
    const val ACTION = "com.symbol.datawedge.api.ACTION"
    const val RESULT_ACTION = "com.symbol.datawedge.api.RESULT_ACTION"
    const val NOTIFICATION_ACTION = "com.symbol.datawedge.api.NOTIFICATION_ACTION"
    const val EXTRA_SOFT_SCAN = "com.symbol.datawedge.api.SOFT_SCAN_TRIGGER"
    const val EXTRA_SET_CONFIG = "com.symbol.datawedge.api.SET_CONFIG"
    const val EXTRA_GET_CONFIG = "com.symbol.datawedge.api.GET_CONFIG"
    const val EXTRA_RESULT_GET_CONFIG = "com.symbol.datawedge.api.RESULT_GET_CONFIG"
    const val TAG = "SeparaDW"
    /** parâmetros do plugin BARCODE que interessam no diagnóstico */
    val PARAMS_LEITOR = listOf("scanner_selection", "scanner_input_enabled", "aim_type", "beam_timer",
      "same_barcode_timeout", "different_barcode_timeout", "aim_timer", "timed_continuous_beam_timer")
    const val EXTRA_GET_ACTIVE_PROFILE = "com.symbol.datawedge.api.GET_ACTIVE_PROFILE"
    const val EXTRA_RESULT_GET_ACTIVE_PROFILE = "com.symbol.datawedge.api.RESULT_GET_ACTIVE_PROFILE"
    const val EXTRA_NOTIFICATION = "com.symbol.datawedge.api.NOTIFICATION"
    const val EXTRA_REGISTER_NOTIFICATION = "com.symbol.datawedge.api.REGISTER_FOR_NOTIFICATION"
    const val EXTRA_UNREGISTER_NOTIFICATION = "com.symbol.datawedge.api.UNREGISTER_FOR_NOTIFICATION"
    const val TIMEOUT_MS = 2000L
    /** sem WAITING novo nesse prazo, assume que o scanner já estava pronto e manda o START */
    const val ESPERA_PRONTO_MS = 2500L
    /** START mandado e nenhum SCANNING nesse prazo → ligar falhou */
    const val ESPERA_SCANNING_MS = 1500L
    /** intervalo mínimo entre dois START seguidos da vigia (WAITING chega em rajada) */
    const val INTERVALO_RELIGAR_MS = 150L
    /** feixe apagou logo depois de ler (coletor em modo gatilho): espera antes de reacender,
     *  senão a mesma peça ainda na frente é lida de novo a cada ~150 ms (bipes em rajada) */
    const val ESPERA_APOS_LEITURA_MS = 800L
  }

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val handler = Handler(Looper.getMainLooper())

  // --- estado da vigia (um só "Leitor" por vez) ---
  private var vigiaReceiver: BroadcastReceiver? = null
  private var vigiaAtiva = false
  private var vigiaIniciou = false          // já mandou o primeiro START
  private var vigiaPromise: Promise? = null // resolve no primeiro SCANNING (ou falha)
  private var ultimoStart = 0L
  private var ultimoStatus: String? = null
  private var religarAgendado: Runnable? = null

  override fun definition() = ModuleDefinition {
    Name("DataWedge")

    OnDestroy { desligarVigia() }

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

    /**
     * Cria o perfil `nome` associado a este app, clonando BARCODE/KEYSTROKE/BDF do perfil `origem`
     * (decodificadores e o Enter ficam como o coletor já usava). Resolve true se o DataWedge
     * aceitou (CREATE_IF_NOT_EXIST). Motivo: no DW 11.4 o SET_CONFIG no "Profile0 (default)"
     * responde SUCCESS e não grava nada — só perfil próprio aceita a troca de aim_type.
     */
    AsyncFunction("criarPerfil") { nome: String, origem: String, promise: Promise ->
      criarPerfil(nome, origem) { promise.resolve(it) }
    }

    /** Lê de volta os parâmetros do leitor no perfil (GET_CONFIG); também vai pro logcat (tag SeparaDW). */
    AsyncFunction("lerParametrosLeitor") { perfil: String, promise: Promise ->
      lerParametros(perfil) { promise.resolve(it) }
    }

    Function("iniciarLeitura") { softScan("START_SCANNING") }
    Function("pararLeitura") { softScan("STOP_SCANNING") }

    /** Liga a vigia: espera WAITING, manda START, resolve true no primeiro SCANNING e segue
     *  religando a cada WAITING até `desligarVigia`. */
    AsyncFunction("ligarVigia") { promise: Promise ->
      handler.post { ligarVigia(promise) }
    }

    /** Para de religar e apaga o feixe. Idempotente. */
    Function("desligarVigia") {
      handler.post { desligarVigia() }
    }
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

  private fun notificacaoStatus(ctx: Context, registrar: Boolean) {
    val b = Bundle().apply {
      putString("com.symbol.datawedge.api.APPLICATION_NAME", ctx.packageName)
      putString("com.symbol.datawedge.api.NOTIFICATION_TYPE", "SCANNER_STATUS")
    }
    val extra = if (registrar) EXTRA_REGISTER_NOTIFICATION else EXTRA_UNREGISTER_NOTIFICATION
    try { ctx.sendBroadcast(Intent(ACTION).putExtra(extra, b)) } catch (e: Exception) { /* sem DW */ }
  }

  // ------------------------------------------------------------------ vigia

  private fun ligarVigia(promise: Promise) {
    if (vigiaAtiva) {
      promise.resolve(true)
      return
    }
    val ctx: Context
    try {
      ctx = context
    } catch (e: Exception) {
      promise.resolve(false)
      return
    }
    vigiaAtiva = true
    vigiaIniciou = false
    vigiaPromise = promise
    ultimoStart = 0L
    ultimoStatus = null

    val receiver = object : BroadcastReceiver() {
      override fun onReceive(c: Context?, recebido: Intent?) {
        if (!vigiaAtiva) return
        val b = recebido?.getBundleExtra(EXTRA_NOTIFICATION) ?: return
        if (b.getString("NOTIFICATION_TYPE") != "SCANNER_STATUS") return
        val status = b.getString("STATUS")
        val anterior = ultimoStatus
        ultimoStatus = status
        Log.i(TAG, "status $anterior -> $status (perfil ${b.getString("PROFILE_NAME")})")
        when (status) {
          // depois de SCANNING o WAITING é fim de leitura (ou gatilho/timeout): segura um pouco
          "WAITING" -> religar(if (anterior == "SCANNING") ESPERA_APOS_LEITURA_MS else 0L)
          "SCANNING" -> concluirInicio(true)
        }
      }
    }
    vigiaReceiver = receiver
    val filtro = IntentFilter(NOTIFICATION_ACTION).apply { addCategory(Intent.CATEGORY_DEFAULT) }
    try {
      if (Build.VERSION.SDK_INT >= 33) {
        ctx.registerReceiver(receiver, filtro, Context.RECEIVER_EXPORTED)
      } else {
        ctx.registerReceiver(receiver, filtro)
      }
      notificacaoStatus(ctx, true)
    } catch (e: Exception) {
      desligarVigia()
      concluirInicio(false)
      return
    }
    // scanner já estava WAITING antes de registrarmos e não vai mandar status novo
    handler.postDelayed({ if (vigiaAtiva && !vigiaIniciou) religar() }, ESPERA_PRONTO_MS)
  }

  /** feixe apagado (WAITING) com a vigia ligada → START de novo (adiado, nunca descartado) */
  private fun religar(espera: Long = 0L) {
    if (!vigiaAtiva) return
    val agora = System.currentTimeMillis()
    val faltaIntervalo = INTERVALO_RELIGAR_MS - (agora - ultimoStart)
    val atraso = maxOf(espera, faltaIntervalo)
    if (atraso > 0) {
      religarAgendado?.let { handler.removeCallbacks(it) }
      val r = Runnable { religarAgendado = null; religar(0L) }
      religarAgendado = r
      handler.postDelayed(r, atraso)
      return
    }
    ultimoStart = agora
    softScan("START_SCANNING")
    if (!vigiaIniciou) {
      vigiaIniciou = true
      handler.postDelayed({
        if (vigiaPromise != null) {       // nunca chegou SCANNING → não acendeu
          desligarVigia()
          concluirInicio(false)
        }
      }, ESPERA_SCANNING_MS)
    }
  }

  private fun concluirInicio(ok: Boolean) {
    val p = vigiaPromise ?: return
    vigiaPromise = null
    p.resolve(ok)
  }

  private fun desligarVigia() {
    if (!vigiaAtiva && vigiaReceiver == null) return
    vigiaAtiva = false
    religarAgendado?.let { handler.removeCallbacks(it) }
    religarAgendado = null
    val ctx = try { context } catch (e: Exception) { null }
    vigiaReceiver?.let { r ->
      try { ctx?.unregisterReceiver(r) } catch (e: Exception) { /* já saiu */ }
    }
    vigiaReceiver = null
    if (ctx != null) notificacaoStatus(ctx, false)
    softScan("STOP_SCANNING")
    concluirInicio(false)
  }

  // ------------------------------------------------------------- perfil próprio

  private fun criarPerfil(nome: String, origem: String, aoTerminar: (Boolean) -> Unit) {
    val ctx: Context
    try {
      ctx = context
    } catch (e: Exception) {
      aoTerminar(false)
      return
    }
    lerPlugins(origem, listOf("BARCODE", "KEYSTROKE", "BDF")) { plugins ->
      val configs = ArrayList<Bundle>()
      for ((plugin, params) in plugins) {
        // só valores String de chaves minúsculas: o resto (SCANNER_STATUS, regras, scripts) é
        // leitura ou estrutura que o SET_CONFIG não aceita de volta
        val limpos = Bundle()
        for (k in params.keySet()) {
          val v = params.get(k)
          if (v is String && k.isNotEmpty() && k[0].isLowerCase()) limpos.putString(k, v)
        }
        Log.i(TAG, "clonando $plugin de '$origem': ${limpos.size()} params")
        configs.add(Bundle().apply {
          putString("PLUGIN_NAME", plugin)
          putString("RESET_CONFIG", "true")
          putBundle("PARAM_LIST", limpos)
        })
      }
      val app = Bundle().apply {
        putString("PACKAGE_NAME", ctx.packageName)
        putStringArray("ACTIVITY_LIST", arrayOf("*"))
      }
      val profile = Bundle().apply {
        putString("PROFILE_NAME", nome)
        putString("PROFILE_ENABLED", "true")
        putString("CONFIG_MODE", "CREATE_IF_NOT_EXIST")
        putParcelableArray("APP_LIST", arrayOf(app))
        if (configs.isNotEmpty()) putParcelableArrayList("PLUGIN_CONFIG", configs)
      }
      val id = UUID.randomUUID().toString()
      val intent = Intent(ACTION)
        .putExtra(EXTRA_SET_CONFIG, profile)
        .putExtra("SEND_RESULT", "true")
        .putExtra("COMMAND_IDENTIFIER", id)
      enviarEEsperar(intent, { it.getStringExtra("COMMAND_IDENTIFIER") == id }) { resposta ->
        val info = resposta?.getBundleExtra("RESULT_INFO")
        Log.i(TAG, "CRIAR perfil=$nome origem=$origem -> ${resposta?.getStringExtra("RESULT") ?: "timeout"} " +
          (info?.keySet()?.joinToString(" ") { "$it=${info.get(it)}" } ?: ""))
        aoTerminar(resposta?.getStringExtra("RESULT") == "SUCCESS")
      }
    }
  }

  /** GET_CONFIG de vários plugins do perfil → mapa plugin → PARAM_LIST (vazio se não respondeu) */
  private fun lerPlugins(perfil: String, plugins: List<String>, aoTerminar: (Map<String, Bundle>) -> Unit) {
    val config = Bundle().apply {
      putString("PROFILE_NAME", perfil)
      putBundle("PLUGIN_CONFIG", Bundle().apply { putStringArrayList("PLUGIN_NAME", ArrayList(plugins)) })
    }
    val intent = Intent(ACTION).putExtra(EXTRA_GET_CONFIG, config)
    enviarEEsperar(intent, { it.hasExtra(EXTRA_RESULT_GET_CONFIG) }) { resposta ->
      val mapa = LinkedHashMap<String, Bundle>()
      for (b in listarPlugins(resposta?.getBundleExtra(EXTRA_RESULT_GET_CONFIG))) {
        val nome = b.getString("PLUGIN_NAME") ?: continue
        val params = b.getBundle("PARAM_LIST") ?: continue
        mapa[nome] = params
        if (nome != "BARCODE") {
          Log.i(TAG, "perfil=$perfil $nome: " + params.keySet().joinToString(" ") { "$it=${params.get(it)}" })
        }
      }
      aoTerminar(mapa)
    }
  }

  @Suppress("DEPRECATION")
  private fun listarPlugins(resultado: Bundle?): List<Bundle> {
    if (resultado == null) return emptyList()
    val lista = mutableListOf<Bundle>()
    resultado.getParcelableArrayList<Bundle>("PLUGIN_CONFIG")?.forEach { lista.add(it) }
    resultado.getParcelableArray("PLUGIN_CONFIG")?.forEach { if (it is Bundle) lista.add(it) }
    resultado.getBundle("PLUGIN_CONFIG")?.let { lista.add(it) }
    return lista
  }

  // ------------------------------------------------------------- GET_CONFIG

  private fun lerParametros(perfil: String, aoTerminar: (Map<String, String?>) -> Unit) {
    val config = Bundle().apply {
      putString("PROFILE_NAME", perfil)
      putBundle("PLUGIN_CONFIG", Bundle().apply {
        putStringArrayList("PLUGIN_NAME", arrayListOf("BARCODE"))
      })
    }
    val intent = Intent(ACTION).putExtra(EXTRA_GET_CONFIG, config)
    enviarEEsperar(intent, { it.hasExtra(EXTRA_RESULT_GET_CONFIG) }) { resposta ->
      val resultado = resposta?.getBundleExtra(EXTRA_RESULT_GET_CONFIG)
      val params = extrairParamsBarcode(resultado)
      val mapa = PARAMS_LEITOR.associateWith { params?.getString(it) }
      Log.i(TAG, "perfil=$perfil ${mapa.entries.joinToString(" ") { "${it.key}=${it.value}" }} " +
        "(resposta=${if (resposta == null) "timeout" else "ok"})")
      aoTerminar(mapa)
    }
  }

  /** PLUGIN_CONFIG volta como ArrayList<Bundle> (ou Bundle[]/Bundle, conforme a versão) — acha o BARCODE e devolve o PARAM_LIST */
  @Suppress("DEPRECATION")
  private fun extrairParamsBarcode(resultado: Bundle?): Bundle? {
    if (resultado == null) return null
    val lista = listarPlugins(resultado)
    val barcode = lista.firstOrNull { it.getString("PLUGIN_NAME") == "BARCODE" } ?: lista.firstOrNull()
    return barcode?.getBundle("PARAM_LIST")
  }

  // ------------------------------------------------------------- SET_CONFIG

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
      val ok = resposta?.getStringExtra("RESULT") == "SUCCESS"
      val info = resposta?.getBundleExtra("RESULT_INFO")
      Log.i(TAG, "SET_CONFIG perfil=$perfil ${params.keySet().joinToString(" ") { "$it=${params.getString(it)}" }} " +
        "-> ${resposta?.getStringExtra("RESULT") ?: "timeout"} ${info?.keySet()?.joinToString(" ") { "$it=${info.get(it)}" } ?: ""}")
      promise.resolve(ok)
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
