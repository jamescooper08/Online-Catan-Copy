import './App.css'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  findCoastalEdges,
  measureHexes,
  pierStyle,
  placementFromEdge,
  snapDockToCoast,
} from './dockGeometry'

function App() {
  const [page, setPage] = useState('welcome')
  const [hexagons, setHexagons] = useState([])
  const [docks, setDocks] = useState([])
  const [remainingTiles, setRemainingTiles] = useState(19)
  const [activeGridPoint, setActiveGridPoint] = useState(null)
  const [isOverDeleteZone, setIsOverDeleteZone] = useState(false)
  const [dockLayouts, setDockLayouts] = useState({})
  const [draggingDockId, setDraggingDockId] = useState(null)
  const socketRef = useRef(null)
  const gameScreenRef = useRef(null)

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

  useLayoutEffect(() => {
    const gameArea = gameScreenRef.current
    if (!gameArea || page !== 'game') return

    function layoutAttachedDocks() {
      const hexes = measureHexes(gameArea)
      const coastalEdges = findCoastalEdges(hexes)
      const gameScreen = gameArea.getBoundingClientRect()
      const nextLayouts = {}

      for (const dock of docks) {
        if (dock.id === draggingDockId) continue

        const attached = coastalEdges.find((item) =>
          item.hex.id === dock.tileId && item.edge.index === dock.edgeIndex,
        )
        if (!attached) continue

        const placement = placementFromEdge(attached)
        nextLayouts[dock.id] = {
          left: asPercent(placement.x, gameScreen.width),
          top: asPercent(placement.y, gameScreen.height),
          x: placement.x,
          y: placement.y,
          start: placement.start,
          end: placement.end,
        }
      }

      setDockLayouts(nextLayouts)
    }

    layoutAttachedDocks()
    const observer = new ResizeObserver(layoutAttachedDocks)
    observer.observe(gameArea)
    window.addEventListener('resize', layoutAttachedDocks)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', layoutAttachedDocks)
    }
  }, [docks, draggingDockId, hexagons, page])

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

    const gameArea = event.currentTarget.closest('.game-screen')
    const gameScreen = gameArea.getBoundingClientRect()
    const x = Math.min(Math.max(event.clientX - gameScreen.left, 24), gameScreen.width - 24)
    const y = Math.min(Math.max(event.clientY - gameScreen.top, 24), gameScreen.height - 24)

    setDocks((currentDocks) => currentDocks.map((dock) =>
      dock.id === dockId
        ? { ...dock, left: `${x}px`, top: `${y}px`, tileId: null, edgeIndex: null }
        : dock,
    ))
  }

  function releaseDock(event, dockId) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return

    event.currentTarget.releasePointerCapture(event.pointerId)
    const gameArea = event.currentTarget.closest('.game-screen')
    const gameScreen = gameArea.getBoundingClientRect()
    const markerBounds = event.currentTarget.getBoundingClientRect()
    const point = {
      x: markerBounds.left - gameScreen.left + markerBounds.width / 2,
      y: markerBounds.top - gameScreen.top + markerBounds.height / 2,
    }
    const occupied = new Set(
      docks
        .filter((dock) => dock.id !== dockId && dock.tileId != null && dock.edgeIndex != null)
        .map((dock) => `${dock.tileId}:${dock.edgeIndex}`),
    )
    const snapped = snapDockToCoast(point, findCoastalEdges(measureHexes(gameArea)), occupied)
    const position = snapped
      ? {
          left: asPercent(snapped.x, gameScreen.width),
          top: asPercent(snapped.y, gameScreen.height),
        }
      : {
          left: asPercent(point.x, gameScreen.width),
          top: asPercent(point.y, gameScreen.height),
        }
    const tileId = snapped ? snapped.tileId : null
    const edgeIndex = snapped ? snapped.edgeIndex : null

    setDraggingDockId(null)
    setDocks((currentDocks) => currentDocks.map((currentDock) =>
      currentDock.id === dockId
        ? { ...currentDock, ...position, tileId, edgeIndex }
        : currentDock,
    ))
    sendAction({
      type: 'move_dock',
      id: dockId,
      position,
      tileId,
      edgeIndex,
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
        <section className="game-screen" aria-labelledby="game-title" ref={gameScreenRef}>
          <p className="eyebrow">Catan Online</p>
          <div className="docks" aria-label="Catan docks">
            {docks.map((dock) => {
              const layout = dock.id === draggingDockId ? null : dockLayouts[dock.id]
              const left = layout?.left ?? dock.left
              const top = layout?.top ?? dock.top
              const attached = Boolean(layout)
              const firstPier = attached ? pierStyle(layout, layout.start, 34) : null
              const secondPier = attached ? pierStyle(layout, layout.end, 34) : null

              return (
              <div
                className={`dock${dock.label === '2:1' ? ' dock-specialized' : ''}${attached ? ' is-attached' : ''}`}
                key={dock.id}
                title={`${dock.label} ${dock.name}`}
                style={{ left, top }}
              >
                {attached && (
                  <>
                    <span className="dock-pier" style={firstPier} aria-hidden="true" />
                    <span className="dock-pier" style={secondPier} aria-hidden="true" />
                  </>
                )}
                <span
                  className="dock-marker"
                  role="button"
                  aria-label={`${dock.label} ${dock.name} dock`}
                  onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId)
                    setDraggingDockId(dock.id)
                  }}
                  onPointerMove={(event) => moveDock(event, dock.id)}
                  onPointerUp={(event) => releaseDock(event, dock.id)}
                  onPointerCancel={(event) => releaseDock(event, dock.id)}
                >
                  <span className="dock-mark" aria-hidden="true">PORT</span>
                  <span className="dock-trade">{dock.label}</span>
                  <span className="dock-resource">{dock.name === 'Any resource' ? 'Any' : dock.name}</span>
                </span>
              </div>
              )
            })}
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
