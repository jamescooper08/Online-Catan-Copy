import asyncio
import json
from pathlib import Path

import websockets

HOST = "0.0.0.0"
PORT = 8765
STATE_FILE = Path(__file__).with_name("map_state.json")

TERRAIN_TILES = (
    [{"name": "Forest", "color": "#6e9b4f"}] * 4
    + [{"name": "Pasture", "color": "#a9c879"}] * 4
    + [{"name": "Fields", "color": "#e0bd54"}] * 4
    + [{"name": "Mountains", "color": "#7f8c8d"}] * 3
    + [{"name": "Hills", "color": "#c58a58"}] * 3
    + [{"name": "Desert", "color": "#d9b978"}]
)

DOCKS = [
    {"id": "generic-north-west", "label": "3:1", "name": "Any resource", "left": "28%", "top": "20%", "edge": "top"},
    {"id": "wood-north-east", "label": "2:1", "name": "Wood", "left": "72%", "top": "20%", "edge": "top"},
    {"id": "generic-west-upper", "label": "3:1", "name": "Any resource", "left": "6%", "top": "32%", "edge": "left"},
    {"id": "brick-west-lower", "label": "2:1", "name": "Brick", "left": "6%", "top": "62%", "edge": "left"},
    {"id": "generic-east-upper", "label": "3:1", "name": "Any resource", "left": "94%", "top": "32%", "edge": "right"},
    {"id": "sheep-east-lower", "label": "2:1", "name": "Sheep", "left": "94%", "top": "62%", "edge": "right"},
    {"id": "generic-south-west", "label": "3:1", "name": "Any resource", "left": "28%", "top": "68%", "edge": "bottom"},
    {"id": "wheat-south", "label": "2:1", "name": "Wheat", "left": "50%", "top": "73%", "edge": "bottom"},
    {"id": "ore-south-east", "label": "2:1", "name": "Ore", "left": "72%", "top": "68%", "edge": "bottom"},
]
DEFAULT_DOCK_EDGES = {dock["id"]: dock["edge"] for dock in DOCKS}


def default_state():
    return {
        "tiles": [],
        "docks": DOCKS,
        "available_terrain": list(TERRAIN_TILES),
        "next_tile_id": 0,
    }


def load_state():
    if not STATE_FILE.exists():
        return default_state()

    try:
        with STATE_FILE.open("r", encoding="utf-8") as state_file:
            state = json.load(state_file)
        if {"tiles", "docks", "available_terrain", "next_tile_id"} <= state.keys():
            for dock in state["docks"]:
                dock.setdefault("edge", DEFAULT_DOCK_EDGES.get(dock["id"], "bottom"))
            return state
    except (OSError, json.JSONDecodeError):
        pass

    return default_state()


state = load_state()
clients = set()
state_lock = asyncio.Lock()


def save_state():
    temporary_file = STATE_FILE.with_suffix(".tmp")
    with temporary_file.open("w", encoding="utf-8") as state_file:
        json.dump(state, state_file, indent=2)
    temporary_file.replace(STATE_FILE)


def public_state():
    return {
        "tiles": state["tiles"],
        "docks": state["docks"],
        "remaining_tiles": len(state["available_terrain"]),
    }


def valid_position(position):
    return (
        isinstance(position, dict)
        and isinstance(position.get("left"), str)
        and isinstance(position.get("top"), str)
    )


def handle_action(action):
    action_type = action.get("type")

    if action_type == "spawn_tile" and state["available_terrain"]:
        terrain = state["available_terrain"].pop(0)
        state["tiles"].append({
            "id": state["next_tile_id"],
            "terrain": terrain,
            "position": {"left": "80%", "top": "80%"},
        })
        state["next_tile_id"] += 1
        return True

    if action_type == "move_tile" and valid_position(action.get("position")):
        for tile in state["tiles"]:
            if tile["id"] == action.get("id"):
                tile["position"] = action["position"]
                return True

    if action_type == "remove_tile":
        for index, tile in enumerate(state["tiles"]):
            if tile["id"] == action.get("id"):
                state["available_terrain"].append(tile["terrain"])
                state["tiles"].pop(index)
                return True

    if action_type == "move_dock" and valid_position(action.get("position")):
        edge = action.get("edge")
        if edge not in {"top", "right", "bottom", "left"}:
            return False
        for dock in state["docks"]:
            if dock["id"] == action.get("id"):
                dock["left"] = action["position"]["left"]
                dock["top"] = action["position"]["top"]
                dock["edge"] = edge
                return True

    if action_type == "reset_map":
        state.clear()
        state.update(default_state())
        return True

    return False


async def broadcast():
    if not clients:
        return

    message = json.dumps({"type": "map_state", "state": public_state()})
    disconnected_clients = set()
    for client in clients:
        try:
            await client.send(message)
        except websockets.exceptions.ConnectionClosed:
            disconnected_clients.add(client)
    clients.difference_update(disconnected_clients)


async def handle_client(websocket):
    clients.add(websocket)
    await websocket.send(json.dumps({"type": "map_state", "state": public_state()}))

    try:
        async for raw_message in websocket:
            try:
                action = json.loads(raw_message)
            except json.JSONDecodeError:
                continue

            async with state_lock:
                if handle_action(action):
                    save_state()
                    await broadcast()
    finally:
        clients.discard(websocket)


async def main():
    async with websockets.serve(handle_client, HOST, PORT):
        print(f"Catan map server listening on ws://{HOST}:{PORT}")
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
