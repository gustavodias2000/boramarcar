# Gera os subagentes do Claude Code a partir de .ai-team/agents.
#
# Diferença em relação ao script do Barbershop: aqui não há sincronização com pasta externa.
# `.ai-team/agents` é a fonte de verdade, versionada no repositório (ver context/DECISOES.md).
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File .\.ai-team\generate-claude-agents.ps1

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$agentSourceRoot = Join-Path $PSScriptRoot "agents"
$claudeAgentsRoot = Join-Path (Join-Path $projectRoot ".claude") "agents"

if (-not (Test-Path -LiteralPath $agentSourceRoot)) {
  throw "Pasta de agentes nao encontrada: $agentSourceRoot"
}

$agentSourceFiles = @(Get-ChildItem -LiteralPath $agentSourceRoot -File -Filter "*.md" | Sort-Object Name)

if ($agentSourceFiles.Count -ne 10) {
  throw "Esperados 10 perfis em $agentSourceRoot; encontrados: $($agentSourceFiles.Count)"
}

New-Item -ItemType Directory -Force -Path $claudeAgentsRoot | Out-Null

foreach ($agentSourceFile in $agentSourceFiles) {
  $body = Get-Content -LiteralPath $agentSourceFile.FullName -Raw -Encoding UTF8
  $lines = @($body -split "\r?\n")
  $roleHeadingIndex = [Array]::IndexOf($lines, "## Papel")

  if ($roleHeadingIndex -lt 0) {
    throw "Secao Papel nao encontrada em $($agentSourceFile.FullName)"
  }

  $roleParagraphs = @(
    $lines[($roleHeadingIndex + 1)..($lines.Count - 1)] |
      Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
  )

  if ($roleParagraphs.Count -lt 2) {
    throw "Descricao do papel nao encontrada em $($agentSourceFile.FullName)"
  }

  # O nome do subagente e o do arquivo sem o prefixo numerico.
  # A descricao e o segundo paragrafo de "## Papel" — a frase "Sua funcao e ...".
  $agentName = [IO.Path]::GetFileNameWithoutExtension($agentSourceFile.Name) -replace "^\d+-", ""
  $description = $roleParagraphs[1].Trim().Replace("'", "''")
  $frontmatter = "---`nname: $agentName`ndescription: '$description'`n---`n`n"
  $targetFile = Join-Path $claudeAgentsRoot "$agentName.md"
  $utf8WithoutBom = New-Object Text.UTF8Encoding($false)

  [IO.File]::WriteAllText($targetFile, $frontmatter + $body, $utf8WithoutBom)
}

Write-Output "$($agentSourceFiles.Count) subagentes gerados em $claudeAgentsRoot"
