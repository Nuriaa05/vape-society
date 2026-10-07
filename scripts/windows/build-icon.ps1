$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$source = [System.Drawing.Image]::FromFile($env:VAPE_BUILD_LOGO_PATH)
$bitmap = New-Object System.Drawing.Bitmap(256, 256)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try {
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $scale = [Math]::Min(256 / $source.Width, 256 / $source.Height)
    $width = [int]($source.Width * $scale)
    $height = [int]($source.Height * $scale)
    $graphics.DrawImage($source, [int]((256 - $width) / 2), [int]((256 - $height) / 2), $width, $height)
    $icon = [System.Drawing.Icon]::FromHandle($bitmap.GetHicon())
    $stream = [System.IO.File]::Create($env:VAPE_BUILD_ICON_PATH)
    try { $icon.Save($stream) }
    finally { $stream.Dispose(); $icon.Dispose() }
} finally {
    $graphics.Dispose()
    $bitmap.Dispose()
    $source.Dispose()
}
