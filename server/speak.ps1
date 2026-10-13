param([string]$InputFile,[string]$OutputFile,[string]$WordsFile,[string]$Voice='')
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Speech
Add-Type -ReferencedAssemblies @('System.Speech','System.Core') -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Speech.Synthesis;
public class TimedWord { public string w; public double start; }
public static class FramecraftVoice {
 public static List<TimedWord> Render(string text,string output,string voice) {
  var words=new List<TimedWord>();
  using(var synth=new SpeechSynthesizer()) {
   if(!String.IsNullOrEmpty(voice)) synth.SelectVoice(voice);
   synth.SpeakProgress += delegate(object sender, SpeakProgressEventArgs e) { words.Add(new TimedWord { w=e.Text,start=e.AudioPosition.TotalSeconds }); };
   synth.SetOutputToWaveFile(output,new System.Speech.AudioFormat.SpeechAudioFormatInfo(16000,System.Speech.AudioFormat.AudioBitsPerSample.Sixteen,System.Speech.AudioFormat.AudioChannel.Mono));
   synth.Speak(text);
  }
  return words;
 }
}
'@
$text=[IO.File]::ReadAllText($InputFile)
$wordEvents=[FramecraftVoice]::Render($text,$OutputFile,$Voice)
ConvertTo-Json -InputObject @($wordEvents.ToArray()) -Depth 5 | Set-Content -LiteralPath $WordsFile -Encoding UTF8
