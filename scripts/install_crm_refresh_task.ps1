param([switch]$VerifyOnly)
$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$python = Join-Path $root '.venv\Scripts\pythonw.exe'
$script = Join-Path $root 'scripts\refresh_all_data.py'
$statusPath = Join-Path $root 'data\data-refresh-status.json'
$taskName = 'Reise-Panorama-CRM-SSOT-ReadOnly'

if ($VerifyOnly) {
    Get-ScheduledTask -TaskName $taskName | Select-Object TaskName, State, Triggers, Actions
    Get-ScheduledTaskInfo -TaskName $taskName | Select-Object LastRunTime, LastTaskResult, NextRunTime
    exit 0
}
if (!(Test-Path -LiteralPath $python) -or !(Test-Path -LiteralPath $script)) {
    throw 'Python do projeto ou coletor nao encontrado.'
}
if ((Get-TimeZone).Id -ne 'E. South America Standard Time') {
    throw 'O agendamento requer o fuso de Brasilia no Windows.'
}
if (!(Test-Path -LiteralPath $statusPath)) { throw 'Execute e valide a coleta antes de instalar o agendamento.' }
$status = Get-Content -LiteralPath $statusPath -Raw | ConvertFrom-Json
if (!$status.finishedAt -or $status.sources.Count -ne 5 -or @($status.sources | Where-Object { $_.status -notin @('current', 'stale') }).Count) {
    throw 'Valide a leitura das cinco fontes antes de substituir o agendamento. Atraso da origem e falha de leitura sao estados distintos.'
}
if ([DateTimeOffset]::Parse($status.checkedAt) -lt [DateTimeOffset]::Now.AddHours(-24)) {
    throw 'A coleta de validacao tem mais de 24 horas.'
}
$action = New-ScheduledTaskAction -Execute $python -Argument ('"' + $script + '"') -WorkingDirectory $root
$triggers = @(8, 12, 16, 20 | ForEach-Object { New-ScheduledTaskTrigger -Daily -At ([datetime]::Today.AddHours($_)) })
$triggers += New-ScheduledTaskTrigger -AtLogOn -User ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 15) -ExecutionTimeLimit (New-TimeSpan -Minutes 15) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -Hidden
$principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$task = New-ScheduledTask -Action $action -Trigger $triggers -Settings $settings -Principal $principal -Description 'Leitura unificada Panorama: SSOT, Growth, WhatsApp Oficial, RD e SendFlow. Nao altera fontes nem publica no Vercel. Requer computador ligado, sessao e login Google valido. A coleta dos provedores para as planilhas e independente.'
Register-ScheduledTask -TaskName $taskName -InputObject $task -Force | Select-Object TaskName, State
Get-ScheduledTaskInfo -TaskName $taskName | Select-Object LastRunTime, LastTaskResult, NextRunTime
