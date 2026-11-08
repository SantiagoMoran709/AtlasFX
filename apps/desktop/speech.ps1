$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$engine = $null
$stream = $null

try {
    Add-Type -AssemblyName System.Speech
    $recognizers = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers()
    if ($env:ATLASFX_SPEECH_MODE -eq 'languages') {
        $languages = @(foreach ($candidate in $recognizers) {
            try {
                $engine = [System.Speech.Recognition.SpeechRecognitionEngine]::new([string]$candidate.Id)
                $engine.LoadGrammar([System.Speech.Recognition.DictationGrammar]::new())
                @{ id = $candidate.Culture.Name; label = $candidate.Culture.NativeName }
            } catch {
                # Windows can list a recognizer whose language files are missing.
            } finally {
                if ($null -ne $engine) { $engine.Dispose(); $engine = $null }
            }
        })
        [Console]::WriteLine((ConvertTo-Json -InputObject @{ languages = $languages } -Compress))
    } else {
        $recognizer = $recognizers | Where-Object { $_.Culture.Name -eq $env:ATLASFX_SPEECH_LANGUAGE } | Select-Object -First 1
        if ($null -eq $recognizer) { throw 'El idioma elegido no tiene reconocimiento de voz instalado en Windows.' }
        $engine = [System.Speech.Recognition.SpeechRecognitionEngine]::new([string]$recognizer.Id)
        $engine.LoadGrammar([System.Speech.Recognition.DictationGrammar]::new())
        $engine.InitialSilenceTimeout = [TimeSpan]::Zero
        $stream = [System.IO.MemoryStream]::new()
        [Console]::OpenStandardInput().CopyTo($stream)
        $stream.Position = 0
        $engine.SetInputToWaveStream($stream)

        $cues = [System.Collections.Generic.List[object]]::new()
        Register-ObjectEvent -InputObject $engine -EventName SpeechRecognized -SourceIdentifier AtlasSpeechCue | Out-Null
        Register-ObjectEvent -InputObject $engine -EventName RecognizeCompleted -SourceIdentifier AtlasSpeechDone | Out-Null
        $engine.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)
        while ($true) {
            $event = Wait-Event -Timeout 110
            if ($null -eq $event) { throw 'El reconocedor de Windows tardó demasiado.' }
            Remove-Event -EventIdentifier $event.EventIdentifier
            if ($event.SourceIdentifier -eq 'AtlasSpeechDone') {
                if ($null -ne $event.SourceEventArgs.Error) { throw $event.SourceEventArgs.Error }
                break
            }
            if ($event.SourceIdentifier -ne 'AtlasSpeechCue') { continue }
            $result = $event.SourceEventArgs.Result
            if ($null -eq $result.Audio -or [string]::IsNullOrWhiteSpace($result.Text)) { continue }
            $start = $result.Audio.AudioPosition.TotalSeconds
            $cues.Add(@{
                text = $result.Text
                start = $start
                end = $start + $result.Audio.Duration.TotalSeconds
            })
        }
        [Console]::WriteLine((ConvertTo-Json -InputObject @{ cues = $cues.ToArray() } -Compress))
    }
} catch {
    [Console]::WriteLine((ConvertTo-Json -InputObject @{ error = $_.Exception.Message } -Compress))
} finally {
    if ($null -ne $engine) { $engine.Dispose() }
    if ($null -ne $stream) { $stream.Dispose() }
}
