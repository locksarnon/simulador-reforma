# Wrapper chamado pelo Agendador de Tarefas do Windows — roda scripts/backup.sh
# via Git Bash e registra o resultado num log, para dar pra auditar depois se
# rodou e se deu certo (Task Scheduler por si só não guarda saída de forma
# fácil de ler).
$ErrorActionPreference = "Stop"
$root = "C:\Users\Arnon Locks\Desktop\Docker - Simulador Reforma"
Set-Location $root

$logDir = Join-Path $root "backups"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir "backup-scheduled.log"

$bash = "C:\Program Files\Git\usr\bin\bash.exe"
$stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

try {
    $output = & $bash -lc "cd '/c/Users/Arnon Locks/Desktop/Docker - Simulador Reforma' && bash scripts/backup.sh" 2>&1
    Add-Content -Path $logFile -Value "[$stamp] OK`n$output`n"
} catch {
    Add-Content -Path $logFile -Value "[$stamp] FALHOU: $($_.Exception.Message)`n"
    exit 1
}
