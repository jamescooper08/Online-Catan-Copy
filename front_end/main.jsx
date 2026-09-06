import { createRoot } from 'react-dom/client';

function Hello() {
  return (
    <h1>Hello World!</h1>
  );
}

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found. Add an element with id="root" to the HTML.');
}

createRoot(rootElement).render(
  <Hello />
);
