param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$RenderArgs
)

# This machine's automatic Chromium mode selects SwiftShader.
# Explicit GPU mode was verified to use AMD Radeon Direct3D11.
# Keep the default worker count modest on this 16 GB computer.
Push-Location -LiteralPath $PSScriptRoot
try {
    & node (Join-Path $PSScriptRoot 'render.mjs') --gl gpu --workers 2 @RenderArgs
    $renderExitCode = $LASTEXITCODE
} finally {
    Pop-Location
}
exit $renderExitCode
