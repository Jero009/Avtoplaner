import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from './app-shell';
import { DashboardPage } from '../pages/DashboardPage';
import { CalendarPage } from '../pages/CalendarPage';
import { TimetablePage } from '../pages/TimetablePage';
import { GradesPage } from '../pages/GradesPage';
import { HomeworkPage } from '../pages/HomeworkPage';
import { SettingsPage } from '../pages/SettingsPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="timetable" element={<TimetablePage />} />
          <Route path="grades" element={<GradesPage />} />
          <Route path="homework" element={<HomeworkPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
