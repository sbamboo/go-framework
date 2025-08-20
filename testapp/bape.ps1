param (
    [Parameter(Mandatory = $true)]
    [string]$FilePath,

    [Parameter(Mandatory = $true)]
    [string]$HexString
)

# Ensure hex string length is even
if ($HexString.Length % 2 -ne 0) {
    Write-Error "Hex string must have an even number of characters."
    exit 1
}

# Convert hex string to byte array
$bytes = for ($i = 0; $i -lt $HexString.Length; $i += 2) {
    [Convert]::ToByte($HexString.Substring($i, 2), 16)
}

# Append raw bytes to the file
[System.IO.File]::OpenWrite($FilePath).Close() # ensure file exists
$fs = [System.IO.File]::Open($FilePath, [System.IO.FileMode]::Append)
$fs.Write($bytes, 0, $bytes.Length)
$fs.Close()

Write-Host "Appended $($bytes.Length) bytes to $FilePath"
