# Spooky rising chime: short A minor run, low to high, with a brief eerie last note.
$notes = @(
  @(110, 60), @(165, 60), @(220, 60),
  @(330, 60), @(440, 60), @(659, 70),
  @(880, 220)
)
foreach ($n in $notes) { [Console]::Beep($n[0], $n[1]) }
