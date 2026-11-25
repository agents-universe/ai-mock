import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { ProjectListPage } from './pages/ProjectListPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { ApiEditorPage } from './pages/ApiEditorPage';
import { SettingsDatabasePage } from './pages/SettingsDatabasePage';
import { SettingsTokenPage } from './pages/SettingsTokenPage';
import { LogsPage } from './pages/LogsPage';

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<ProjectListPage />} />
        <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
        <Route path="/projects/:projectId/apis/:apiId" element={<ApiEditorPage />} />
        <Route path="/projects/:projectId/logs" element={<LogsPage />} />
        <Route path="/settings/database" element={<SettingsDatabasePage />} />
        <Route path="/settings/tokens" element={<SettingsTokenPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
