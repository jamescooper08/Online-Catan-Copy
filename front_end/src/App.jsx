import './App.css'
import { useEffect, useRef, useState } from 'react'

function App() {
  const [page, setPage] = useState('welcome')
  const [hexagons, setHexagons] = useState([])
  const [docks, setDocks] = useState([])
  const [remainingTiles, setRemainingTiles] = useState(19)
  const [activeGridPoint, setActiveGridPoint] = useState(null)
  const [isOverDeleteZone, setIsOverDeleteZone] = useState(false)
  const socketRef = useRef(null)

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const socket = new WebSocket(`${protocol}://${window.location.hostname}:8765`)
    socketRef.current = socket

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data)
      if (message.type !== 'map_state') return

      setHexagons(message.state.tiles)
      setDocks(message.state.docks)
      setRemainingTiles(message.state.remaining_tiles)
    }

    return () => socket.close()
  }, [])

  function sendAction(action) {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(action))
    }
  }

  function asPercent(value, total) {
    return `${Math.round((value / total) * 1000) / 10}%`
  }

  function getGridPoints(gameScreen, imageBounds) {
    const horizontalOffset = imageBounds.width * 0.92
    const verticalOffset = imageBounds.height * 0.82
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
      sendAction({ type: 'remove_tile', id: hexagonId })
      setActiveGridPoint(null)
      setIsOverDeleteZone(false)
      return
    }

    const closestPosition = getClosestGridPoint(image)
    setActiveGridPoint(null)
    setIsOverDeleteZone(false)

    if (closestPosition) {
      const gameScreen = image.parentElement.getBoundingClientRect()
      const position = {
        left: asPercent(closestPosition.x, gameScreen.width),
        top: asPercent(closestPosition.y, gameScreen.height),
      }
      setHexagons((currentHexagons) => currentHexagons.map((hexagon) =>
        hexagon.id === hexagonId
          ? {
              ...hexagon,
              position,
            }
          : hexagon,
      ))
      sendAction({ type: 'move_tile', id: hexagonId, position })
    }
  }

  function spawnHexagon() {
    sendAction({ type: 'spawn_tile' })
  }

  function moveDock(event, dockId) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return

    const dock = event.currentTarget
    const gameScreen = dock.parentElement.parentElement.getBoundingClientRect()
    const dockBounds = dock.getBoundingClientRect()
    const x = Math.min(
      Math.max(event.clientX - gameScreen.left, dockBounds.width / 2),
      gameScreen.width - dockBounds.width / 2,
    )
    const y = Math.min(
      Math.max(event.clientY - gameScreen.top, dockBounds.height / 2),
      gameScreen.height - dockBounds.height / 2,
    )

    setDocks((currentDocks) => currentDocks.map((dock) =>
      dock.id === dockId
        ? { ...dock, left: `${x}px`, top: `${y}px` }
        : dock,
    ))
  }

  function releaseDock(event, dockId) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return

    event.currentTarget.releasePointerCapture(event.pointerId)
    const dock = event.currentTarget
    const gameArea = dock.parentElement.parentElement
    const gameScreen = gameArea.getBoundingClientRect()
    const dockBounds = dock.getBoundingClientRect()
    const centerX = dockBounds.left - gameScreen.left + dockBounds.width / 2
    const centerY = dockBounds.top - gameScreen.top + dockBounds.height / 2
    const tileBounds = [...gameArea.querySelectorAll('.plain-hexagon')]
      .map((tile) => tile.getBoundingClientRect())
      .reduce((bounds, tile) => ({
        left: Math.min(bounds.left, tile.left - gameScreen.left),
        right: Math.max(bounds.right, tile.right - gameScreen.left),
        top: Math.min(bounds.top, tile.top - gameScreen.top),
        bottom: Math.max(bounds.bottom, tile.bottom - gameScreen.top),
      }), {
        left: Number.POSITIVE_INFINITY,
        right: Number.NEGATIVE_INFINITY,
        top: Number.POSITIVE_INFINITY,
        bottom: Number.NEGATIVE_INFINITY,
      })
    const hasBoard = tileBounds.left !== Number.POSITIVE_INFINITY
    const board = hasBoard ? tileBounds : {
      left: gameScreen.width * 0.12,
      right: gameScreen.width * 0.88,
      top: gameScreen.height * 0.2,
      bottom: gameScreen.height * 0.68,
    }
    const edgeDistances = {
      top: Math.abs(centerY - board.top),
      right: Math.abs(board.right - centerX),
      bottom: Math.abs(board.bottom - centerY),
      left: Math.abs(centerX - board.left),
    }
    const nearestEdge = Object.entries(edgeDistances).reduce((closestEdge, edge) =>
      edge[1] < closestEdge[1] ? edge : closestEdge,
    )[0]
    const halfDockWidth = dockBounds.width / 2
    const halfDockHeight = dockBounds.height / 2
    let snappedX = Math.min(Math.max(centerX, board.left + halfDockWidth), board.right - halfDockWidth)
    let snappedY = Math.min(Math.max(centerY, board.top + halfDockHeight), board.bottom - halfDockHeight)

    if (nearestEdge === 'top') snappedY = board.top - halfDockHeight
    if (nearestEdge === 'right') snappedX = board.right + halfDockWidth
    if (nearestEdge === 'bottom') snappedY = board.bottom + halfDockHeight
    if (nearestEdge === 'left') snappedX = board.left - halfDockWidth

    const position = {
      left: asPercent(snappedX, gameScreen.width),
      top: asPercent(snappedY, gameScreen.height),
    }
    setDocks((currentDocks) => currentDocks.map((currentDock) =>
      currentDock.id === dockId
        ? { ...currentDock, ...position, edge: nearestEdge }
        : currentDock,
    ))
    sendAction({
      type: 'move_dock',
      id: dockId,
      position,
      edge: nearestEdge,
    })
  }

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
          <div className="docks" aria-label="Catan docks">
            {docks.map((dock) => (
              <div
                className={`dock dock-edge-${dock.edge || 'bottom'}${dock.label === '2:1' ? ' dock-specialized' : ''}`}
                key={dock.id}
                title={`${dock.label} ${dock.name}`}
                style={{ left: dock.left, top: dock.top }}
                onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
                onPointerMove={(event) => moveDock(event, dock.id)}
                onPointerUp={(event) => releaseDock(event, dock.id)}
                onPointerCancel={(event) => releaseDock(event, dock.id)}
              >
                <span className="dock-pier dock-pier-first" aria-hidden="true" />
                <span className="dock-marker">
                  <span className="dock-mark" aria-hidden="true">PORT</span>
                  <span className="dock-trade">{dock.label}</span>
                  <span className="dock-resource">{dock.name === 'Any resource' ? 'Any' : dock.name}</span>
                </span>
                <span className="dock-pier dock-pier-second" aria-hidden="true" />
              </div>
            ))}
          </div>
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
            <div
              key={hexagon.id}
              className="plain-hexagon"
              role="img"
              aria-label={`${hexagon.terrain.name} terrain tile ${index + 1}`}
              data-hexagon-id={hexagon.id}
              style={{ ...hexagon.position, '--hex-color': hexagon.terrain.color }}
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
          <button
            className="spawn-button"
            type="button"
            onClick={spawnHexagon}
            disabled={remainingTiles === 0}
          >
            {remainingTiles > 0 ? `Spawn Hexagon (${remainingTiles})` : 'All Tiles Spawned'}
          </button>
          <button className="back-button" type="button" onClick={() => setPage('welcome')}>
            Back to Welcome
          </button>
        </section>
      )}
    </main>
  )
}

export default App
