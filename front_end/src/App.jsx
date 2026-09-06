import './App.css'
import { useState } from 'react'

function App() {
  const [page, setPage] = useState('welcome')

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
          <button type="button" onClick={() => setPage('welcome')}>
            Back to Welcome
          </button>
        </section>
      )}
    </main>
  )
}

export default App
