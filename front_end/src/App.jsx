import './App.css'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  findCoastalEdges,
  findBoardEdges,
  findBoardVertices,
  measureHexes,
  pierStyle,
  placementFromEdge,
  snapDockToCoast,
  snapPiece,
} from './dockGeometry'

function App() {
  const playerColors = [
    { id: 'red', label: 'Red', value: '#d94f49' },
    { id: 'blue', label: 'Blue', value: '#3d78b8' },
    { id: 'orange', label: 'Orange', value: '#e28a32' },
    { id: 'white', label: 'White', value: '#f4f1e8' },
  ]
  const [page, setPage] = useState('welcome')
  const [hexagons, setHexagons] = useState([])
  const [docks, setDocks] = useState([])
  const [pieces, setPieces] = useState([])
  const [selectedColor, setSelectedColor] = useState('red')
  const [remainingTiles, setRemainingTiles] = useState(19)
  const [activeGridPoint, setActiveGridPoint] = useState(null)
  const [dockLayouts, setDockLayouts] = useState({})
  const [draggingDockId, setDraggingDockId] = useState(null)
  const [draggingPieceId, setDraggingPieceId] = useState(null)
  const [pieceLayouts, setPieceLayouts] = useState({})
  const resourceTypes = [
    { id: 'wheat', label: 'Wheat', color: '#d9b841' },
    { id: 'stone', label: 'Stone', color: '#7d7f84' },
    { id: 'brick', label: 'Brick', color: '#b96742' },
    { id: 'sheep', label: 'Sheep', color: '#9acb7b' },
    { id: 'wood', label: 'Wood', color: '#6f8d4d' },
  ]
  const [resourceCounts, setResourceCounts] = useState({
    wheat: 0,
    stone: 0,
    brick: 0,
    sheep: 0,
    wood: 0,
  })
  const socketRef = useRef(null)
  const pendingActionsRef = useRef([])
  const gameScreenRef = useRef(null)

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const socket = new WebSocket(`${protocol}://${window.location.hostname}:8765`)
    socketRef.current = socket

    socket.onopen = () => {
      for (const action of pendingActionsRef.current) socket.send(JSON.stringify(action))
      pendingActionsRef.current = []
    }

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data)
      if (message.type !== 'map_state') return

      setHexagons(message.state.tiles)
      setDocks(message.state.docks)
      setPieces(message.state.pieces ?? [])
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

  useLayoutEffect(() => {
    const gameArea = gameScreenRef.current
    if (!gameArea || page !== 'game') return

    function layoutPieces() {
      const hexes = measureHexes(gameArea)
      const gameScreen = gameArea.getBoundingClientRect()
      const edges = findBoardEdges(hexes)
      const vertices = findBoardVertices(hexes)
      const nextLayouts = {}

      for (const piece of pieces) {
        if (piece.id === draggingPieceId) continue
        let point = null
        if (piece.pieceType === 'road' && piece.tileId != null && piece.edgeIndex != null) {
          const edge = edges.find((item) => item.hex.id === piece.tileId && item.edge.index === piece.edgeIndex)
          point = edge?.edge.mid
          if (edge) {
            nextLayouts[piece.id] = {
              left: asPercent(point.x, gameScreen.width),
              top: asPercent(point.y, gameScreen.height),
              rotation: Math.atan2(edge.edge.end.y - edge.edge.start.y, edge.edge.end.x - edge.edge.start.x) * 180 / Math.PI,
            }
          }
        } else if (piece.pieceType !== 'road' && piece.vertexKey) {
          point = vertices.find((vertex) => vertex.key === piece.vertexKey)
        }
        if (point && !nextLayouts[piece.id]) {
          nextLayouts[piece.id] = { left: asPercent(point.x, gameScreen.width), top: asPercent(point.y, gameScreen.height), rotation: 0 }
        }
      }

      setPieceLayouts(nextLayouts)
    }

    layoutPieces()
    const observer = new ResizeObserver(layoutPieces)
    observer.observe(gameArea)
    window.addEventListener('resize', layoutPieces)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', layoutPieces)
    }
  }, [draggingPieceId, hexagons, page, pieces])

  function sendAction(action) {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(action))
      return
    }

    pendingActionsRef.current.push(action)
  }

  function asPercent(value, total) {
    return `${Math.round((value / total) * 1000) / 10}%`
  }

  function getGridPoints(gameScreen, imageBounds) {
    const horizontalOffset = imageBounds.width * 0.92
    const verticalOffset = imageBounds.height * 0.82
    const centerX = gameScreen.width / 2
    const centerY = gameScreen.height / 2 - 200
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
    setActiveGridPoint(getClosestGridPoint(image))
  }

  function snapHexagon(event, hexagonId) {
    const image = event.currentTarget
    if (!image.hasPointerCapture(event.pointerId)) return

    image.releasePointerCapture(event.pointerId)

    const closestPosition = getClosestGridPoint(image)
    setActiveGridPoint(null)

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

  function resetMap() {
    sendAction({ type: 'reset_map' })
  }

  function changeResourceCount(resourceId, delta) {
    setResourceCounts((currentCounts) => ({
      ...currentCounts,
      [resourceId]: Math.max(0, (currentCounts[resourceId] ?? 0) + delta),
    }))
  }

  function spawnPiece(pieceType) {
    sendAction({ type: 'spawn_piece', pieceType, color: selectedColor })
  }

  function movePiece(event, pieceId) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    const gameArea = event.currentTarget.closest('.game-screen')
    const gameScreen = gameArea.getBoundingClientRect()
    const x = Math.min(Math.max(event.clientX - gameScreen.left, 12), gameScreen.width - 12)
    const y = Math.min(Math.max(event.clientY - gameScreen.top, 12), gameScreen.height - 12)
    setPieces((currentPieces) => currentPieces.map((piece) =>
      piece.id === pieceId
        ? { ...piece, position: { left: `${x}px`, top: `${y}px` }, tileId: null, edgeIndex: null, vertexKey: null }
        : piece,
    ))
  }

  function releasePiece(event, pieceId) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    event.currentTarget.releasePointerCapture(event.pointerId)
    const gameArea = event.currentTarget.closest('.game-screen')
    const gameScreen = gameArea.getBoundingClientRect()
    const bounds = event.currentTarget.getBoundingClientRect()
    const point = { x: bounds.left - gameScreen.left + bounds.width / 2, y: bounds.top - gameScreen.top + bounds.height / 2 }
    const piece = pieces.find((item) => item.id === pieceId)
    if (!piece) return
    const hexes = measureHexes(gameArea)
    const edges = findBoardEdges(hexes).map((item) => ({ point: item.edge.mid, tileId: item.hex.id, edgeIndex: item.edge.index, width: item.hex.width }))
    const vertices = findBoardVertices(hexes).map((vertex) => ({ ...vertex, point: vertex, width: hexes[0]?.width }))
    const occupied = new Set(pieces.filter((item) => item.id !== pieceId).map((item) => item.pieceType === 'road' ? `${item.tileId}:${item.edgeIndex}` : item.vertexKey))
    const target = piece.pieceType === 'road'
      ? snapPiece(point, edges, occupied, (anchor) => `${anchor.tileId}:${anchor.edgeIndex}`)
      : snapPiece(point, vertices, occupied, (anchor) => anchor.key)
    const position = target
      ? { left: asPercent(target.point.x, gameScreen.width), top: asPercent(target.point.y, gameScreen.height) }
      : { left: asPercent(point.x, gameScreen.width), top: asPercent(point.y, gameScreen.height) }
    const rotation = target?.start && target?.end
      ? Math.atan2(target.end.y - target.start.y, target.end.x - target.start.x) * 180 / Math.PI
      : 0
    const placement = piece.pieceType === 'road'
      ? { tileId: target?.tileId ?? null, edgeIndex: target?.edgeIndex ?? null, vertexKey: null }
      : { tileId: null, edgeIndex: null, vertexKey: target?.key ?? null }
    setDraggingPieceId(null)
    if (piece.pieceType === 'road' && target) {
      setPieceLayouts((currentLayouts) => ({
        ...currentLayouts,
        [pieceId]: { ...position, rotation },
      }))
    }
    setPieces((currentPieces) => currentPieces.map((currentPiece) => currentPiece.id === pieceId ? { ...currentPiece, ...placement, position } : currentPiece))
    sendAction({ type: 'move_piece', id: pieceId, position, ...placement })
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
          <div className="pieces" aria-label="Catan game pieces">
            {pieces.map((piece) => {
              const layout = piece.id === draggingPieceId ? null : pieceLayouts[piece.id]
              return (
                <span
                  className={`piece piece-${piece.pieceType}`}
                  key={piece.id}
                  title={`Player piece: ${piece.pieceType}`}
                  style={{
                    left: layout?.left ?? piece.position.left,
                    top: layout?.top ?? piece.position.top,
                    '--road-angle': `${layout?.rotation ?? 0}deg`,
                    '--player-color': playerColors.find((color) => color.id === piece.color)?.value ?? '#d94f49',
                  }}
                  role="button"
                  aria-label={`Player ${piece.pieceType}`}
                  onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setDraggingPieceId(piece.id) }}
                  onPointerMove={(event) => movePiece(event, piece.id)}
                  onPointerUp={(event) => releasePiece(event, piece.id)}
                  onPointerCancel={(event) => releasePiece(event, piece.id)}
                />
              )
            })}
          </div>
          <div className="bottom-toolbar">
            <div className="bottom-controls">
              <button className="reset-button" type="button" onClick={resetMap}>
                Reset Map
              </button>
              <button
                className="spawn-button"
                type="button"
                onClick={spawnHexagon}
                disabled={remainingTiles === 0}
              >
                {remainingTiles > 0 ? `Spawn Hexagon (${remainingTiles})` : 'All Tiles Spawned'}
              </button>
            </div>
            <div className="resource-panel" aria-label="Resource counters">
              {resourceTypes.map((resource) => (
                <div className="resource-counter" key={resource.id}>
                  <div className="resource-header">
                    <span className="resource-swatch" style={{ background: resource.color }} aria-hidden="true" />
                    <span>{resource.label}</span>
                  </div>
                  <div className="resource-controls">
                    <button
                      type="button"
                      className="resource-button resource-button-minus"
                      aria-label={`Decrease ${resource.label}`}
                      onClick={() => changeResourceCount(resource.id, -1)}
                    >
                      −
                    </button>
                    <span className="resource-value" aria-live="polite">{resourceCounts[resource.id]}</span>
                    <button
                      type="button"
                      className="resource-button resource-button-plus"
                      aria-label={`Increase ${resource.label}`}
                      onClick={() => changeResourceCount(resource.id, 1)}
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button className="back-button" type="button" onClick={() => setPage('welcome')}>
              Back to Welcome
            </button>
          </div>
          <div className="piece-controls" aria-label="Choose player color and add game pieces">
            <div className="color-controls" aria-label="Player colors">
              {playerColors.map((color) => (
                <button
                  className={`color-button color-${color.id}${selectedColor === color.id ? ' is-selected' : ''}`}
                  key={color.id}
                  type="button"
                  aria-label={`Select ${color.label} player pieces`}
                  aria-pressed={selectedColor === color.id}
                  onClick={() => setSelectedColor(color.id)}
                >
                  <span className="color-swatch" aria-hidden="true" />
                  {color.label}
                </button>
              ))}
            </div>
            <div className="piece-type-controls" aria-label={`Add ${selectedColor} player pieces`}>
              <button type="button" onClick={() => spawnPiece('road')}>+ Road</button>
              <button type="button" onClick={() => spawnPiece('settlement')}>+ Settlement</button>
              <button type="button" onClick={() => spawnPiece('city')}>+ City</button>
            </div>
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
              }}
            />
          ))}
        </section>
      )}
    </main>
  )
}

export default App
