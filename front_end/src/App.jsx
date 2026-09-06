import './App.css'
import { useEffect, useRef, useState } from 'react'
import plainHexagon from './assets/Plain Hexagon.png'

function App() {
  const [page, setPage] = useState('welcome')
  const [hexagons, setHexagons] = useState([])
  const nextHexagonId = useRef(0)

  function moveHexagon(event, hexagonId) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return

    const image = event.currentTarget
    const gameScreen = image.parentElement.getBoundingClientRect()
    const imageBounds = image.getBoundingClientRect()
    const x = Math.min(
      Math.max(event.clientX - gameScreen.left, imageBounds.width / 2),
      gameScreen.width - imageBounds.width / 2,
    )
    const y = Math.min(
      Math.max(event.clientY - gameScreen.top, imageBounds.height / 2),
      gameScreen.height - imageBounds.height / 2,
    )

    setHexagons((currentHexagons) => currentHexagons.map((hexagon) =>
      hexagon.id === hexagonId
        ? { ...hexagon, position: { left: `${x}px`, top: `${y}px` } }
        : hexagon,
    ))
  }

  function snapHexagon(event, hexagonId) {
    const image = event.currentTarget
    if (!image.hasPointerCapture(event.pointerId)) return

    image.releasePointerCapture(event.pointerId)

    const gameScreen = image.parentElement.getBoundingClientRect()
    const imageBounds = image.getBoundingClientRect()
    const imageCenter = {
      x: imageBounds.left - gameScreen.left + imageBounds.width / 2,
      y: imageBounds.top - gameScreen.top + imageBounds.height / 2,
    }
    const horizontalOffset = imageBounds.width * 0.75
    const verticalOffset = imageBounds.height
    const snapDistance = 20
    let closestPosition = null
    let closestDistance = snapDistance

    image.parentElement.querySelectorAll('[data-hexagon-id]').forEach((otherImage) => {
      if (otherImage === image) return

      const otherBounds = otherImage.getBoundingClientRect()
      const otherCenter = {
        x: otherBounds.left - gameScreen.left + otherBounds.width / 2,
        y: otherBounds.top - gameScreen.top + otherBounds.height / 2,
      }
      const candidatePositions = [
        { x: otherCenter.x - horizontalOffset, y: otherCenter.y },
        { x: otherCenter.x + horizontalOffset, y: otherCenter.y },
        { x: otherCenter.x - horizontalOffset / 2, y: otherCenter.y - verticalOffset },
        { x: otherCenter.x + horizontalOffset / 2, y: otherCenter.y - verticalOffset },
        { x: otherCenter.x - horizontalOffset / 2, y: otherCenter.y + verticalOffset },
        { x: otherCenter.x + horizontalOffset / 2, y: otherCenter.y + verticalOffset },
      ]

      candidatePositions.forEach((candidate) => {
        const distance = Math.hypot(
          candidate.x - imageCenter.x,
          candidate.y - imageCenter.y,
        )
        if (distance < closestDistance) {
          closestDistance = distance
          closestPosition = candidate
        }
      })
    })

    if (closestPosition) {
      setHexagons((currentHexagons) => currentHexagons.map((hexagon) =>
        hexagon.id === hexagonId
          ? {
              ...hexagon,
              position: {
                left: `${closestPosition.x}px`,
                top: `${closestPosition.y}px`,
              },
            }
          : hexagon,
      ))
    }
  }

  useEffect(() => {
    function handleKeyDown(event) {
      if (page === 'game' && event.key.toLowerCase() === 'b' && !event.repeat) {
        setHexagons((currentHexagons) => [
          ...currentHexagons,
          { id: nextHexagonId.current++, position: null },
        ])
      }
    }
    window.addEventListener('keydown', handleKeyDown)

    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [page])

  return (
    <main className="app-shell">
      {page === 'welcome' ? (
        <section className="welcome-screen" aria-labelledby="welcome-title">
          <p className="eyebrow">A strategy game for friends</p>
          <h1 id="welcome-title">Catan Online</h1>
          <p className="welcome-copy">
            Build, trade, and settle the island together.
          </p>
          <button type="button" onClick={() => setPage('game')}>
            Enter Game
          </button>
        </section>
      ) : (
        <section className="game-screen" aria-labelledby="game-title">
          <p className="eyebrow">Catan Online</p>
          {hexagons.map((hexagon, index) => (
            <img
              key={hexagon.id}
              className="plain-hexagon"
              src={plainHexagon}
              alt={`Plain hexagon game tile ${index + 1}`}
              data-hexagon-id={hexagon.id}
              style={hexagon.position || {
                left: `calc(50% + ${index * 28}px)`,
                top: `calc(50% + ${index * 28}px)`,
              }}
              draggable="false"
              onDragStart={(event) => event.preventDefault()}
              onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
              onPointerMove={(event) => moveHexagon(event, hexagon.id)}
              onPointerUp={(event) => snapHexagon(event, hexagon.id)}
              onPointerCancel={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
            />
          ))}
          <button type="button" onClick={() => setPage('welcome')}>
            Back to Welcome
          </button>
        </section>
      )}
    </main>
  )
}

export default App
