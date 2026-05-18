import django, os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.senior.oracle import fetch

# 1. Colunas de E120TRK
print('=== E120TRK colunas ===')
cols = fetch("""
    SELECT COLUMN_NAME, DATA_TYPE
    FROM ALL_TAB_COLUMNS
    WHERE TABLE_NAME = 'E120TRK'
    ORDER BY COLUMN_ID
""")
for c in cols:
    print(' ', c['column_name'], c['data_type'])

# 2. E120TRK para pedidos CODEMP=8 recentes
print('\n=== E120TRK para NUMPEDs CODEMP=8 ===')
numeros = [3154, 3153, 3152, 3151, 3150, 3149, 3148, 3147, 3146, 3145]
ph = ','.join([f':{i+1}' for i in range(len(numeros))])
trk = fetch(f"SELECT * FROM E120TRK WHERE NUMPED IN ({ph})", numeros)
for r in trk:
    print(' ', r)
if not trk:
    print('  (nenhuma linha)')

# 3. USU_* campos relevantes em E120PED para esses pedidos
print('\n=== USU_NUMFAT, USU_CODEMP, USU_CODFIL, USU_ENVEMA em E120PED CODEMP=8 ===')
usu = fetch("""
    SELECT NUMPED, SITPED, CODFIL,
           USU_NUMFAT, USU_CODEMP, USU_CODFIL, USU_ENVEMA, NUMANX, FILFAT
    FROM E120PED
    WHERE CODEMP = 8
      AND ROWNUM <= 10
    ORDER BY NUMPED DESC
""")
for r in usu:
    print(' ', r)

# 4. Amostra E120TRK sem filtro
print('\n=== E120TRK amostra (3 linhas) ===')
try:
    s = fetch("SELECT * FROM E120TRK WHERE ROWNUM<=3")
    for r in s:
        print(' ', r)
except Exception as e:
    print(' erro:', e)
