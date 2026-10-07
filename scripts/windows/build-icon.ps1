$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$source = [System.Drawing.Image]::FromFile($env:VAPE_BUILD_LOGO_PATH)
try {
    # Ignore transparent canvas margins so the logo fills the Windows icon more fully.
    $sourceBounds = [System.Drawing.Rectangle]::new(0, 0, $source.Width, $source.Height)
    $sourceLocked = $source.LockBits($sourceBounds, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
        $sourcePixels = [byte[]]::new($sourceLocked.Stride * $source.Height)
        [System.Runtime.InteropServices.Marshal]::Copy($sourceLocked.Scan0, $sourcePixels, 0, $sourcePixels.Length)
        $left = $source.Width
        $top = $source.Height
        $right = -1
        $bottom = -1
        for ($row = 0; $row -lt $source.Height; $row++) {
            $rowOffset = $row * $sourceLocked.Stride
            $rowLeft = 0
            while ($rowLeft -lt $source.Width -and $sourcePixels[$rowOffset + $rowLeft * 4 + 3] -eq 0) { $rowLeft++ }
            if ($rowLeft -eq $source.Width) { continue }
            $rowRight = $source.Width - 1
            while ($rowRight -gt $rowLeft -and $sourcePixels[$rowOffset + $rowRight * 4 + 3] -eq 0) { $rowRight-- }
            $left = [Math]::Min($left, $rowLeft)
            $top = [Math]::Min($top, $row)
            $right = [Math]::Max($right, $rowRight)
            $bottom = $row
        }
        if ($right -ge $left) {
            $sourceBounds = [System.Drawing.Rectangle]::FromLTRB($left, $top, $right + 1, $bottom + 1)
        }
    } finally { $source.UnlockBits($sourceLocked) }

    $frames = @()
    foreach ($size in @(16, 24, 32, 48, 64, 128, 256)) {
        $bitmap = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        $frameStream = [System.IO.MemoryStream]::new()
        $frameWriter = [System.IO.BinaryWriter]::new($frameStream)
        try {
            $graphics.Clear([System.Drawing.Color]::Transparent)
            $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $scale = [Math]::Min($size / $sourceBounds.Width, $size / $sourceBounds.Height)
            $width = [int]($sourceBounds.Width * $scale)
            $height = [int]($sourceBounds.Height * $scale)
            $destinationBounds = [System.Drawing.Rectangle]::new([int](($size - $width) / 2), [int](($size - $height) / 2), $width, $height)
            $graphics.DrawImage($source, $destinationBounds, $sourceBounds, [System.Drawing.GraphicsUnit]::Pixel)
            $rectangle = [System.Drawing.Rectangle]::new(0, 0, $size, $size)
            $locked = $bitmap.LockBits($rectangle, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
            try {
                $pixels = [byte[]]::new($locked.Stride * $size)
                [System.Runtime.InteropServices.Marshal]::Copy($locked.Scan0, $pixels, 0, $pixels.Length)
            } finally { $bitmap.UnlockBits($locked) }

            $maskStride = [int]([Math]::Ceiling($size / 32) * 4)
            $frameWriter.Write([uint32]40)
            $frameWriter.Write([int32]$size)
            $frameWriter.Write([int32]($size * 2))
            $frameWriter.Write([uint16]1)
            $frameWriter.Write([uint16]32)
            $frameWriter.Write([uint32]0)
            $frameWriter.Write([uint32]($pixels.Length + $maskStride * $size))
            $frameWriter.Write([int32]0)
            $frameWriter.Write([int32]0)
            $frameWriter.Write([uint32]0)
            $frameWriter.Write([uint32]0)
            for ($row = $size - 1; $row -ge 0; $row--) {
                $frameWriter.Write($pixels, $row * $locked.Stride, $size * 4)
            }
            for ($row = $size - 1; $row -ge 0; $row--) {
                $mask = [byte[]]::new($maskStride)
                for ($column = 0; $column -lt $size; $column++) {
                    if ($pixels[$row * $locked.Stride + $column * 4 + 3] -eq 0) {
                        $byteIndex = [int][Math]::Floor($column / 8)
                        $mask[$byteIndex] = $mask[$byteIndex] -bor (128 -shr ($column % 8))
                    }
                }
                $frameWriter.Write($mask)
            }
            $frames += @{ Size = $size; Bytes = $frameStream.ToArray() }
        } finally {
            $frameWriter.Dispose()
            $graphics.Dispose()
            $bitmap.Dispose()
        }
    }

    # Store 32-bit bitmap frames directly so Windows keeps the colors and alpha channel.
    $stream = [System.IO.File]::Create($env:VAPE_BUILD_ICON_PATH)
    $writer = [System.IO.BinaryWriter]::new($stream)
    try {
        $writer.Write([uint16]0)
        $writer.Write([uint16]1)
        $writer.Write([uint16]$frames.Count)
        $offset = 6 + 16 * $frames.Count
        foreach ($frame in $frames) {
            $dimension = if ($frame.Size -eq 256) { 0 } else { $frame.Size }
            $writer.Write([byte]$dimension)
            $writer.Write([byte]$dimension)
            $writer.Write([byte]0)
            $writer.Write([byte]0)
            $writer.Write([uint16]1)
            $writer.Write([uint16]32)
            $writer.Write([uint32]$frame.Bytes.Length)
            $writer.Write([uint32]$offset)
            $offset += $frame.Bytes.Length
        }
        foreach ($frame in $frames) { $writer.Write([byte[]]$frame.Bytes) }
    } finally { $writer.Dispose() }
} finally { $source.Dispose() }
