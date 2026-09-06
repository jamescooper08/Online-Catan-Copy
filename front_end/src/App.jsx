import './App.css'
import { useEffect, useRef, useState } from 'react'
import plainHexagon from './assets/Plain Hexagon.png'

function App() {
  const [page, setPage] = useState('welcome')
  const [hexagons, setHexagons] = useState([])
  const [activeGridPoint, setActiveGridPoint] = useState(null)
  const [isOverDeleteZone, setIsOverDeleteZone] = useState(false)
  const nextHexagonId = useRef(0)
  const spawnLocation = { left: '80%', top: '80%' }

  function getGridPoints(gameScreen, imageBounds) {
    const horizontalOffset = imageBounds.width * 0.728
    const verticalOffset = imageBounds.height * 0.6525
    const centerX = gameScreen.width / 2
    const centerY = gameScreen.height / 2
    const points = []

    for (let row = -12; row <= 12; row += 1) {
      for (let column = -12; column <= 12; column += 1) {
        const x = centerX + column * horizontalOffset + (row % 2) * horizontalOffset / 2
        const y = centerY + row * verticalOffset

        if (x >= 0 && x <= gameScreen.width && y >= 0 && y <= gameScreen.height) {
          points.push({ x, y, id: `${row}-${column}` })
        }
      }
    }

    return points
  }

  function getClosestGridPoint(image) {
    const gameScreen = image.parentElement.getBoundingClientRect()
    const imageBounds = image.getBoundingClientRect()
    const imageCenter = {
      x: imageBounds.left - gameScreen.left + imageBounds.width / 2,
      y: imageBounds.top - gameScreen.top + imageBounds.height / 2,
    }
    const points = getGridPoints(gameScreen, imageBounds)
    const closestPoint = points.reduce((closest, point) => {
      const distance = Math.hypot(point.x - imageCenter.x, point.y - imageCenter.y)
      return !closest || distance < closest.distance
        ? { ...point, distance }
        : closest
    }, null)

    return closestPoint && closestPoint.distance <= 50 ? closestPoint : null
  }

  function isHexagonOverDeleteZone(image) {
    const deleteZone = image.parentElement.querySelector('[data-delete-zone]')
    if (!deleteZone) return false

    const imageBounds = image.getBoundingClientRect()
    const deleteBounds = deleteZone.getBoundingClientRect()
    const imageCenterX = imageBounds.left + imageBounds.width / 2
    const imageCenterY = imageBounds.top + imageBounds.height / 2

    return imageCenterX >= deleteBounds.left
      && imageCenterX <= deleteBounds.right
      && imageCenterY >= deleteBounds.top
      && imageCenterY <= deleteBounds.bottom
  }

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
    const overDeleteZone = isHexagonOverDeleteZone(image)
    setIsOverDeleteZone(overDeleteZone)
    setActiveGridPoint(overDeleteZone ? null : getClosestGridPoint(image))
  }

  function snapHexagon(event, hexagonId) {
    const image = event.currentTarget
    if (!image.hasPointerCapture(event.pointerId)) return

    image.releasePointerCapture(event.pointerId)

    if (isHexagonOverDeleteZone(image)) {
      setHexagons((currentHexagons) => currentHexagons.filter((hexagon) => hexagon.id !== hexagonId))
      setActiveGridPoint(null)
      setIsOverDeleteZone(false)
      return
    }

    const closestPosition = getClosestGridPoint(image)
    setActiveGridPoint(null)
    setIsOverDeleteZone(false)

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
              { id: nextHexagonId.current++, position: spawnLocation },
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
          <div
            className={`delete-zone${isOverDeleteZone ? ' is-active' : ''}`}
            data-delete-zone
          >
            Delete
          </div>
          {activeGridPoint && (
            <span
              className="grid-point is-active"
              style={{ left: `${activeGridPoint.x}px`, top: `${activeGridPoint.y}px` }}
              aria-hidden="true"
            />
          )}
          {hexagons.map((hexagon, index) => (
            <img
              key={hexagon.id}
              className="plain-hexagon"
              src={plainHexagon}
              alt={`Plain hexagon game tile ${index + 1}`}
              data-hexagon-id={hexagon.id}
              style={hexagon.position}
              draggable="false"
              onDragStart={(event) => event.preventDefault()}
              onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
              onPointerMove={(event) => moveHexagon(event, hexagon.id)}
              onPointerUp={(event) => snapHexagon(event, hexagon.id)}
              onPointerCancel={(event) => {
                event.currentTarget.releasePointerCapture(event.pointerId)
                setActiveGridPoint(null)
                setIsOverDeleteZone(false)
              }}
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
