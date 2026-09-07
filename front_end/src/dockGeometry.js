const HEX_VERTEX_PERCENTS = [
  [50, 0],
  [93, 25],
  [93, 75],
  [50, 100],
  [7, 75],
  [7, 25],
]

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function getHexGeometry(id, rect, origin) {
  const left = rect.left - origin.left
  const top = rect.top - origin.top
  const vertices = HEX_VERTEX_PERCENTS.map(([percentX, percentY]) => ({
    x: left + rect.width * percentX / 100,
    y: top + rect.height * percentY / 100,
  }))
  const center = {
    x: left + rect.width / 2,
    y: top + rect.height / 2,
  }
  const edges = vertices.map((start, index) => {
    const end = vertices[(index + 1) % 6]
    const mid = {
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2,
    }

    return {
      index,
      start,
      end,
      mid,
      outward: {
        x: mid.x - center.x,
        y: mid.y - center.y,
      },
    }
  })

  return {
    id,
    center,
    vertices,
    edges,
    width: rect.width,
  }
}

export function measureHexes(gameArea) {
  const origin = gameArea.getBoundingClientRect()

  return [...gameArea.querySelectorAll('.plain-hexagon')].map((node) =>
    getHexGeometry(Number(node.dataset.hexagonId), node.getBoundingClientRect(), origin),
  )
}

export function findCoastalEdges(hexes) {
  const allEdges = hexes.flatMap((hex) => hex.edges.map((edge) => ({ hex, edge })))
  const threshold = Math.max(12, (hexes[0]?.width ?? 100) * 0.14)

  return allEdges.filter(({ hex, edge }) =>
    !allEdges.some((other) =>
      other.hex.id !== hex.id
      && distance(other.edge.mid, edge.mid) < threshold,
    ),
  )
}

export function findBoardEdges(hexes) {
  const allEdges = hexes.flatMap((hex) => hex.edges.map((edge) => ({ hex, edge })))
  const threshold = Math.max(12, (hexes[0]?.width ?? 100) * 0.14)
  const boardEdges = []

  for (const item of allEdges) {
    if (boardEdges.some((other) => distance(other.edge.mid, item.edge.mid) < threshold)) continue
    boardEdges.push(item)
  }

  return boardEdges
}

export function findBoardVertices(hexes) {
  const threshold = Math.max(12, (hexes[0]?.width ?? 100) * 0.14)
  const vertices = []

  for (const hex of hexes) {
    for (const vertex of hex.vertices) {
      const existing = vertices.find((candidate) => distance(candidate, vertex) < threshold)
      if (!existing) {
        vertices.push({
          ...vertex,
          key: `${Math.round(vertex.x)}-${Math.round(vertex.y)}`,
        })
      }
    }
  }

  return vertices
}

export function snapPiece(point, anchors, occupiedKeys, keyForAnchor) {
  const ranked = anchors
    .map((anchor) => ({ anchor, distance: distance(point, anchor.point) }))
    .filter(({ anchor }) => !occupiedKeys.has(keyForAnchor(anchor)))
    .sort((a, b) => a.distance - b.distance)
  const best = ranked[0]
  return best && best.distance <= Math.max(48, (anchors[0]?.width ?? 100) * 0.45)
    ? best.anchor
    : null
}

export function placementFromEdge(coastalEdge) {
  const { hex, edge } = coastalEdge
  const outwardLength = Math.hypot(edge.outward.x, edge.outward.y) || 1
  const offset = Math.max(82, hex.width * 0.75)
  const x = edge.mid.x + edge.outward.x / outwardLength * offset
  const y = edge.mid.y + edge.outward.y / outwardLength * offset

  return {
    x,
    y,
    start: edge.start,
    end: edge.end,
    tileId: hex.id,
    edgeIndex: edge.index,
  }
}

export function snapDockToCoast(point, coastalEdges, occupiedKeys) {
  if (!coastalEdges.length) return null

  const ranked = coastalEdges.map((item) => {
    const placement = placementFromEdge(item)
    return {
      item,
      placement,
      distance: Math.min(distance(point, item.edge.mid), distance(point, placement)),
    }
  }).sort((a, b) => a.distance - b.distance)

  const hexWidth = coastalEdges[0].hex.width
  const maxDistance = Math.max(80, hexWidth * 0.9)
  const free = ranked.filter((candidate) =>
    !occupiedKeys.has(`${candidate.item.hex.id}:${candidate.item.edge.index}`),
  )
  const best = (free[0] ?? ranked[0])

  return best && best.distance <= maxDistance ? best.placement : null
}

export function pierStyle(from, to, markerRadius) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const angle = Math.atan2(dy, dx)
  const length = Math.max(Math.hypot(dx, dy) - markerRadius + 8, 16)

  return {
    width: `${length}px`,
    left: `${Math.cos(angle) * markerRadius}px`,
    top: `${Math.sin(angle) * markerRadius}px`,
    transform: `translateY(-50%) rotate(${angle * 180 / Math.PI}deg)`,
  }
}
