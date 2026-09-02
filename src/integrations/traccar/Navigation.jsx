import { lazy, Suspense } from 'react';
import { Route, Routes, useSearchParams } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import MainPage from './Integrations/traccar/main/MainPage';
import App from './Integrations/traccar/App';
import Loader from './Integrations/traccar/common/components/Loader';
import { useAsyncTask } from './Integrations/traccar/reactHelper';
import { devicesActions } from './Integrations/traccar/store';
import { generateLoginToken } from './Integrations/traccar/common/components/NativeInterface';
import { useLocalization } from './Integrations/traccar/common/components/LocalizationProvider';
import fetchOrThrow from './Integrations/traccar/common/util/fetchOrThrow';

const CombinedReportPage = lazy(() => import('./Integrations/traccar/reports/CombinedReportPage'));
const PositionsReportPage = lazy(() => import('./Integrations/traccar/reports/PositionsReportPage'));
const ServerPage = lazy(() => import('./Integrations/traccar/settings/ServerPage'));
const UsersPage = lazy(() => import('./Integrations/traccar/settings/UsersPage'));
const DevicePage = lazy(() => import('./Integrations/traccar/settings/DevicePage'));
const UserPage = lazy(() => import('./Integrations/traccar/settings/UserPage'));
const NotificationsPage = lazy(() => import('./Integrations/traccar/settings/NotificationsPage'));
const NotificationPage = lazy(() => import('./Integrations/traccar/settings/NotificationPage'));
const GroupsPage = lazy(() => import('./Integrations/traccar/settings/GroupsPage'));
const GroupPage = lazy(() => import('./Integrations/traccar/settings/GroupPage'));
const PositionPage = lazy(() => import('./Integrations/traccar/other/PositionPage'));
const NetworkPage = lazy(() => import('./Integrations/traccar/other/NetworkPage'));
const EventReportPage = lazy(() => import('./Integrations/traccar/reports/EventReportPage'));
const GeofenceReportPage = lazy(() => import('./Integrations/traccar/reports/GeofenceReportPage'));
const ReplayPage = lazy(() => import('./Integrations/traccar/other/ReplayPage'));
const TripReportPage = lazy(() => import('./Integrations/traccar/reports/TripReportPage'));
const StopReportPage = lazy(() => import('./Integrations/traccar/reports/StopReportPage'));
const SummaryReportPage = lazy(() => import('./Integrations/traccar/reports/SummaryReportPage'));
const ChartReportPage = lazy(() => import('./Integrations/traccar/reports/ChartReportPage'));
const DriversPage = lazy(() => import('./Integrations/traccar/settings/DriversPage'));
const DriverPage = lazy(() => import('./Integrations/traccar/settings/DriverPage'));
const CalendarsPage = lazy(() => import('./Integrations/traccar/settings/CalendarsPage'));
const CalendarPage = lazy(() => import('./Integrations/traccar/settings/CalendarPage'));
const ComputedAttributesPage = lazy(() => import('./Integrations/traccar/settings/ComputedAttributesPage'));
const ComputedAttributePage = lazy(() => import('./Integrations/traccar/settings/ComputedAttributePage'));
const MaintenancesPage = lazy(() => import('./Integrations/traccar/settings/MaintenancesPage'));
const MaintenancePage = lazy(() => import('./Integrations/traccar/settings/MaintenancePage'));
const CommandsPage = lazy(() => import('./Integrations/traccar/settings/CommandsPage'));
const CommandPage = lazy(() => import('./Integrations/traccar/settings/CommandPage'));
const StatisticsPage = lazy(() => import('./Integrations/traccar/reports/StatisticsPage'));
const LoginPage = lazy(() => import('./Integrations/traccar/login/LoginPage'));
const RegisterPage = lazy(() => import('./Integrations/traccar/login/RegisterPage'));
const ResetPasswordPage = lazy(() => import('./Integrations/traccar/login/ResetPasswordPage'));
const GeofencesPage = lazy(() => import('./Integrations/traccar/other/GeofencesPage'));
const GeofencePage = lazy(() => import('./Integrations/traccar/settings/GeofencePage'));
const EventPage = lazy(() => import('./Integrations/traccar/other/EventPage'));
const PreferencesPage = lazy(() => import('./Integrations/traccar/settings/PreferencesPage'));
const AccumulatorsPage = lazy(() => import('./Integrations/traccar/settings/AccumulatorsPage'));
const CommandDevicePage = lazy(() => import('./Integrations/traccar/settings/CommandDevicePage'));
const CommandGroupPage = lazy(() => import('./Integrations/traccar/settings/CommandGroupPage'));
const ChangeServerPage = lazy(() => import('./Integrations/traccar/login/ChangeServerPage'));
const DevicesPage = lazy(() => import('./Integrations/traccar/settings/DevicesPage'));
const ScheduledPage = lazy(() => import('./Integrations/traccar/reports/ScheduledPage'));
const DeviceConnectionsPage = lazy(() => import('./Integrations/traccar/settings/DeviceConnectionsPage'));
const GroupConnectionsPage = lazy(() => import('./Integrations/traccar/settings/GroupConnectionsPage'));
const UserConnectionsPage = lazy(() => import('./Integrations/traccar/settings/UserConnectionsPage'));
const LogsPage = lazy(() => import('./Integrations/traccar/reports/LogsPage'));
const SharePage = lazy(() => import('./Integrations/traccar/settings/SharePage'));
const AnnouncementPage = lazy(() => import('./Integrations/traccar/settings/AnnouncementPage'));
const EmulatorPage = lazy(() => import('./Integrations/traccar/other/EmulatorPage'));
const StreamPage = lazy(() => import('./Integrations/traccar/other/StreamPage'));
const AuditPage = lazy(() => import('./Integrations/traccar/reports/AuditPage'));

const Navigation = () => {
  const dispatch = useDispatch();
  const { setLocalLanguage } = useLocalization();

  const [searchParams, setSearchParams] = useSearchParams();

  const hasQueryParams = ['locale', 'token', 'uniqueId', 'openid'].some((key) =>
    searchParams.has(key),
  );

  useAsyncTask(
    async ({ signal }) => {
      if (!hasQueryParams) {
        return;
      }

      const newParams = new URLSearchParams(searchParams);

      if (searchParams.has('locale')) {
        setLocalLanguage(searchParams.get('locale'));
        newParams.delete('locale');
      }

      if (searchParams.has('token')) {
        const token = searchParams.get('token');
        await fetch(`/api/session?token=${encodeURIComponent(token)}`, { signal });
        newParams.delete('token');
      }

      if (searchParams.has('uniqueId')) {
        const response = await fetchOrThrow(
          `/api/devices?uniqueId=${searchParams.get('uniqueId')}`,
          { signal },
        );
        const items = await response.json();
        if (items.length > 0) {
          dispatch(devicesActions.selectId(items[0].id));
        }
        newParams.delete('uniqueId');
      }

      if (searchParams.has('openid')) {
        if (searchParams.get('openid') === 'success') {
          generateLoginToken();
        }
        newParams.delete('openid');
      }

      setSearchParams(newParams, { replace: true });
    },
    [hasQueryParams, searchParams, setSearchParams, dispatch, setLocalLanguage],
  );

  if (hasQueryParams) {
    return <Loader />;
  }
  return (
    <Suspense fallback={<Loader />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/change-server" element={<ChangeServerPage />} />
        <Route path="/" element={<App />}>
          <Route index element={<MainPage />} />

          <Route path="position/:id" element={<PositionPage />} />
          <Route path="network/:positionId" element={<NetworkPage />} />
          <Route path="event/:id" element={<EventPage />} />
          <Route path="replay" element={<ReplayPage />} />
          <Route path="geofences" element={<GeofencesPage />} />
          <Route path="emulator" element={<EmulatorPage />} />
          <Route path="stream" element={<StreamPage />} />

          <Route path="settings">
            <Route path=":type/:id/share" element={<SharePage />} />
            <Route path="accumulators/:deviceId" element={<AccumulatorsPage />} />
            <Route path="announcement" element={<AnnouncementPage />} />
            <Route path="calendars" element={<CalendarsPage />} />
            <Route path="calendar/:id" element={<CalendarPage />} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="commands" element={<CommandsPage />} />
            <Route path="command/:id" element={<CommandPage />} />
            <Route path="command" element={<CommandPage />} />
            <Route path="attributes" element={<ComputedAttributesPage />} />
            <Route path="attribute/:id" element={<ComputedAttributePage />} />
            <Route path="attribute" element={<ComputedAttributePage />} />
            <Route path="devices" element={<DevicesPage />} />
            <Route path="device/:id/connections" element={<DeviceConnectionsPage />} />
            <Route path="device/:id/command" element={<CommandDevicePage />} />
            <Route path="device/:id" element={<DevicePage />} />
            <Route path="device" element={<DevicePage />} />
            <Route path="drivers" element={<DriversPage />} />
            <Route path="driver/:id" element={<DriverPage />} />
            <Route path="driver" element={<DriverPage />} />
            <Route path="geofence/:id" element={<GeofencePage />} />
            <Route path="geofence" element={<GeofencePage />} />
            <Route path="groups" element={<GroupsPage />} />
            <Route path="group/:id/connections" element={<GroupConnectionsPage />} />
            <Route path="group/:id/command" element={<CommandGroupPage />} />
            <Route path="group/:id" element={<GroupPage />} />
            <Route path="group" element={<GroupPage />} />
            <Route path="maintenances" element={<MaintenancesPage />} />
            <Route path="maintenance/:id" element={<MaintenancePage />} />
            <Route path="maintenance" element={<MaintenancePage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="notification/:id" element={<NotificationPage />} />
            <Route path="notification" element={<NotificationPage />} />
            <Route path="preferences" element={<PreferencesPage />} />
            <Route path="server" element={<ServerPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="user/:id/connections" element={<UserConnectionsPage />} />
            <Route path="user/:id" element={<UserPage />} />
            <Route path="user" element={<UserPage />} />
          </Route>

          <Route path="reports">
            <Route path="combined" element={<CombinedReportPage />} />
            <Route path="chart" element={<ChartReportPage />} />
            <Route path="events" element={<EventReportPage />} />
            <Route path="geofences" element={<GeofenceReportPage />} />
            <Route path="route" element={<PositionsReportPage />} />
            <Route path="stops" element={<StopReportPage />} />
            <Route path="summary" element={<SummaryReportPage />} />
            <Route path="trips" element={<TripReportPage />} />
            <Route path="scheduled" element={<ScheduledPage />} />
            <Route path="statistics" element={<StatisticsPage />} />
            <Route path="audit" element={<AuditPage />} />
            <Route path="logs" element={<LogsPage />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
};

export default Navigation;
