var audioFiles = {
    lobby: new Audio('Audio/lobby.mp3'),
    batalla: new Audio('Audio/batalla.mp3'),
    ataque: new Audio('Audio/ataque.mp3'),
    curacion: new Audio('Audio/curacion.mp3'),
    boton: new Audio('Audio/boton.mp3')
};
audioFiles.lobby.loop = true; audioFiles.lobby.volume = 0.3;
audioFiles.batalla.loop = true; audioFiles.batalla.volume = 0.3;
var currentMusic = null, isMuted = false, challengeBeepInterval = null;

function playMusic(track) { if (currentMusic === audioFiles[track]) return; if (currentMusic) currentMusic.pause(); currentMusic = audioFiles[track]; if (!isMuted) currentMusic.play().catch(e=>{}); }
function playSfx(track) { if (isMuted) return; const sfx = audioFiles[track]; if (!sfx) return; sfx.currentTime = 0; sfx.play().catch(e=>{}); }
function toggleMute() { isMuted = !isMuted; const btn = document.getElementById('btn-mute'); if (isMuted) { if (currentMusic) currentMusic.pause(); btn.textContent = '🔇'; } else { if (currentMusic) currentMusic.play().catch(e=>{}); btn.textContent = '🔊'; } }
function startChallengeBeep() { if (challengeBeepInterval) return; playSfx('boton'); challengeBeepInterval = setInterval(() => { playSfx('boton'); }, 1500); }
function stopChallengeBeep() { if (challengeBeepInterval) { clearInterval(challengeBeepInterval); challengeBeepInterval = null; } }

document.addEventListener('click', (e) => { if(e.target.closest('.btn')) playSfx('boton'); });
