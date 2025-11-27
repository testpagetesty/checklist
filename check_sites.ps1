# PowerShell script for checking site structure
$sites = @('Akıl Oyunları', 'AkılKulesi', 'FunnyGames', 'IQ Oyunları', 'Kraken Games', 'Logic Games', 'Logic Games2', 'Logic Games3', 'Logika', 'logika2', 'logika3', 'Mantik Oyunlari', 'Mantik Oyunlari 2', 'MantikOyun', 'Mantık Oyunları', 'MindGames', 'Oyunlari', 'Sea Games', 'Zeka Dünyası', 'Zeka Oyunları', 'Zeka Platformu', 'ZekaDünyası', 'ZekaDünyası2', 'ZekaDünyass', 'ZekaOyunları')
$results = @()
Write-Host "Checking sites..." -ForegroundColor Yellow
foreach ($site in $sites) {
    $sitePath = Join-Path $PSScriptRoot $site
    if (Test-Path $sitePath) {
        $result = New-Object PSObject -Property @{
            Site = $site
            Exists = $true
            MainPage = $false
            ContactPage = $false
            Documents = 0
            Images = 0
            CSS = $false
            JS = $false
        }
        $mainPages = @('light.html', 'index.html', 'home.html')
        foreach ($page in $mainPages) {
            if (Test-Path (Join-Path $sitePath $page)) {
                $result.MainPage = $true
                break
            }
        }
        $contactPages = @('iletisim.html', 'contact.html', 'contacts.html')
        foreach ($page in $contactPages) {
            if (Test-Path (Join-Path $sitePath $page)) {
                $result.ContactPage = $true
                break
            }
        }
        $docFiles = Get-ChildItem -Path $sitePath -Filter *.html | Where-Object { $_.Name -match 'privacy|gizlilik|cerez|cookie|terms|kullanim|feragat' }
        $result.Documents = $docFiles.Count
        $imageDirs = @('images', 'image', 'img')
        foreach ($imgDir in $imageDirs) {
            $imgPath = Join-Path $sitePath $imgDir
            if (Test-Path $imgPath) {
                $images = Get-ChildItem -Path $imgPath -Include *.jpg,*.jpeg,*.png,*.webp -Recurse -ErrorAction SilentlyContinue
                $result.Images += $images.Count
            }
        }
        $result.CSS = (Test-Path (Join-Path $sitePath 'css')) -or ((Get-ChildItem -Path $sitePath -Filter *.css -ErrorAction SilentlyContinue).Count -gt 0)
        $result.JS = (Test-Path (Join-Path $sitePath 'js')) -or ((Get-ChildItem -Path $sitePath -Filter *.js -ErrorAction SilentlyContinue).Count -gt 0)
        $results += $result
        Write-Host "OK: $site" -ForegroundColor Green
    } else {
        $results += New-Object PSObject -Property @{Site = $site; Exists = $false; MainPage = $false; ContactPage = $false; Documents = 0; Images = 0; CSS = $false; JS = $false}
        Write-Host "NOT FOUND: $site" -ForegroundColor Red
    }
}
$html = "<!DOCTYPE html><html><head><meta charset='UTF-8'><title>Report</title><style>body{font-family:Arial;background:#0a0a0a;color:#e0e0e0;padding:20px}table{width:100%;border-collapse:collapse;background:#1a1a1a}th{background:#2a2a2a;color:#d4af37;padding:12px;text-align:left}td{padding:10px;border-bottom:1px solid #333}tr:hover{background:#222}.ok{color:#4caf50}.fail{color:#f44336}.stat{text-align:center;font-weight:bold}</style></head><body><h1>Site Structure Report</h1><p>Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')</p><table><tr><th>Site</th><th>Exists</th><th>Main</th><th>Contact</th><th>Docs</th><th>Images</th><th>CSS</th><th>JS</th></tr>"
foreach ($r in $results) {
    $existsClass = if ($r.Exists) { "ok" } else { "fail" }
    $existsSym = if ($r.Exists) { "YES" } else { "NO" }
    $mainClass = if ($r.MainPage) { "ok" } else { "fail" }
    $mainSym = if ($r.MainPage) { "YES" } else { "NO" }
    $contactClass = if ($r.ContactPage) { "ok" } else { "fail" }
    $contactSym = if ($r.ContactPage) { "YES" } else { "NO" }
    $cssClass = if ($r.CSS) { "ok" } else { "fail" }
    $cssSym = if ($r.CSS) { "YES" } else { "NO" }
    $jsClass = if ($r.JS) { "ok" } else { "fail" }
    $jsSym = if ($r.JS) { "YES" } else { "NO" }
    $html += "<tr><td>$($r.Site)</td><td class='stat $existsClass'>$existsSym</td><td class='stat $mainClass'>$mainSym</td><td class='stat $contactClass'>$contactSym</td><td class='stat'>$($r.Documents)</td><td class='stat'>$($r.Images)</td><td class='stat $cssClass'>$cssSym</td><td class='stat $jsClass'>$jsSym</td></tr>"
}
$html += "</table></body></html>"
$html | Out-File -FilePath (Join-Path $PSScriptRoot "structure_report.html") -Encoding UTF8
Write-Host "Report saved: structure_report.html" -ForegroundColor Green
Write-Host "Total sites: $($results.Count)"
Write-Host "Existing: $(($results | Where-Object { $_.Exists }).Count)"
Write-Host "With main page: $(($results | Where-Object { $_.MainPage }).Count)"
Write-Host "With contact page: $(($results | Where-Object { $_.ContactPage }).Count)"

