param(
  [Parameter(Mandatory = $true)]
  [string]$SourceRoot
)

$projectName = 'military-theory-quiz'
$outputDir = Join-Path $SourceRoot "$projectName\.source-extract\word"
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
$summary = @()

try {
  $files = Get-ChildItem -LiteralPath $SourceRoot -Recurse -File |
    Where-Object {
      $_.Extension -in '.doc', '.docx' -and
      $_.FullName -notlike "*$projectName*"
    } |
    Sort-Object FullName

  foreach ($file in $files) {
    $document = $word.Documents.Open($file.FullName, $false, $true)
    try {
      $relative = $file.FullName.Substring($SourceRoot.Length).TrimStart('\')
      $safeName = ($relative -replace '[\\/:*?"<>|]', '__') + '.txt'
      $text = $document.Content.Text
      [IO.File]::WriteAllText(
        (Join-Path $outputDir $safeName),
        $text,
        [Text.UTF8Encoding]::new($false)
      )
      $summary += [pscustomobject]@{
        source = $relative
        characters = $text.Length
        output = $safeName
      }
    }
    finally {
      $document.Close(0)
      [Runtime.InteropServices.Marshal]::ReleaseComObject($document) | Out-Null
    }
  }
}
finally {
  $word.Quit()
  [Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}

$summary | ConvertTo-Json -Depth 4
