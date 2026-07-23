const onboardingComponent = {
  init() {
    const introCard = document.getElementById('introCard')
    const beginBtn = document.getElementById('begin')
    const basketballLauncher = document.getElementById('basketballLauncher')
    const arcadeParent = document.getElementById('arcadeParent')
    const countdown = document.getElementById('countdown')
    const countdownContainer = document.getElementById('countdownContainer')
    const gameUI = document.getElementById('gameUI')
    const timer = document.getElementById('timer')
    const gameOverEl = document.getElementById('gameOver')
    const playAgain = document.getElementById('playAgain')

    playAgain.addEventListener('touchend', () => {
      window.location.reload()
    })

    const gameOver = () => {
      this.el.sceneEl.emit('gameover')
      gameOverEl.style.display = 'flex'
    }

    let timerInterval
    // todo: update to 60
    let timeLeft = 60
    const updateTimer = () => {
      timeLeft -= 1
      if (timeLeft > 9) {
        timer.textContent = timeLeft
      } else if (timeLeft > 0) {
        timer.textContent = `0${timeLeft}`
      } else {
        // stop
        timer.textContent = '00'
        clearInterval(timerInterval)
        gameOver()
      }
    }

    const startTimer = () => {
      timerInterval = setInterval(updateTimer, 1000)
    }

    let countdownInterval
    let x = 3
    const updateCountdown = () => {
      x -= 1
      if (x > 0) {
        countdown.textContent = x
      } else {
        countdown.textContent = 'GO!'
        countdownContainer.style.pointerEvents = 'none'
        startTimer()
        setTimeout(() => {
          countdownContainer.style.display = 'none'
        }, 1000)
        clearInterval(countdownInterval)
      }
    }

    const startCountdown = () => {
      basketballLauncher.setAttribute('swipe-to-shoot', '')
      this.el.sceneEl.emit('recenter')
      // arcadeParent.setAttribute('animation', 'property: scale; to: 1 1 1;')
      gameUI.style.display = 'flex'
      countdownInterval = setInterval(updateCountdown, 1000)
    }

    const handleBegin = () => {
      beginBtn.removeEventListener('touchend', handleBegin)
      introCard.classList.add('fade-out')

      setTimeout(() => {
        introCard.style.display = 'none'
      }, 250)

      this.el.emit('begin')
      startCountdown()
    }

    beginBtn.addEventListener('touchend', handleBegin)
  },
}
export {onboardingComponent}
