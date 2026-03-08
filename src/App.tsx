import SnapshotList from './components/SnapshotList';
import StatusLight from './components/StatusLight';
import TrayMenu from './components/TrayMenu';

function App() {
  return (
    <main>
      <h1>OpenClaw Guardian</h1>
      <StatusLight />
      <SnapshotList />
      <TrayMenu />
    </main>
  );
}

export default App;
