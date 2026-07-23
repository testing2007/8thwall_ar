let score = 0  // Initialize score variable

const scoreComponent = {
  init() {
    const finalScore = document.getElementById('finalScore')
    const gameOverText = document.getElementById('gameOverText')

    this.scoreEl = document.getElementById('score')
    this.scored = false  // Flag to indicate whether the ball has scored
    this.el.sceneEl.addEventListener('gameover', () => {
      console.log('game over')
      finalScore.textContent = score

      if (score > 5) {
        gameOverText.textContent = 'That\'s quite the achievement!'
      } else {
        gameOverText.textContent = 'Better luck next time!'
      }
    })
  },
  tick() {
    // Early exit if scored to prevent further execution
    if (this.scored) return

    const goalEl = document.getElementById('goal')
    if (!goalEl) return  // Exit if no goal element found

    // Use getWorldPosition to ensure accurate distance measurement
    const goalPosition = new THREE.Vector3()
    const ballPosition = new THREE.Vector3()
    goalEl.object3D.getWorldPosition(goalPosition)
    this.el.object3D.getWorldPosition(ballPosition)
    const distance = goalPosition.distanceTo(ballPosition)

    if (distance <= 0.2 && !this.scored) {
      score++  // Increment the score
      this.scoreEl.textContent = score
      // console.log(`Current score: ${score}`)
      this.scored = true  // Set flag to true to prevent re-scoring

      const scoreImage = document.getElementById('scored')

      scoreImage.setAttribute('animation__scaleup', {
        property: 'scale',
        to: '2 2 2',
        dur: 500,
        easing: 'easeOutElastic',
        from: '0.001 0.001 0.001',
      })

      // Scale down scoreImage after 2 seconds
      setTimeout(() => {
        scoreImage.setAttribute('animation__scaleup', {
          property: 'scale',
          to: '0.001 0.001 0.001',
          dur: 500,
          easing: 'easeInElastic',
          from: '2 2 2',
        })

        this.scored = false
      }, 1000)
    }
  },
}

export {scoreComponent}
