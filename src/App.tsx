import '@/lib/sentry';
import { lazy, Suspense } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { ActionsProvider } from '@/context/ActionsContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ErrorBusProvider } from '@/components/ErrorBus';
import { Layout } from '@/components/Layout';
import DashboardOverview from '@/pages/DashboardOverview';
import AdminPage from '@/pages/AdminPage';
import TeilnehmerPage from '@/pages/TeilnehmerPage';
import TeilnehmerDetailPage from '@/pages/TeilnehmerDetailPage';
import ErfahrungsraumFormatePage from '@/pages/ErfahrungsraumFormatePage';
import ErfahrungsraumFormateDetailPage from '@/pages/ErfahrungsraumFormateDetailPage';
import SitzungenPage from '@/pages/SitzungenPage';
import SitzungenDetailPage from '@/pages/SitzungenDetailPage';
import BewertungenPage from '@/pages/BewertungenPage';
import BewertungenDetailPage from '@/pages/BewertungenDetailPage';
import PublicFormTeilnehmer from '@/pages/public/PublicForm_Teilnehmer';
import PublicFormErfahrungsraumFormate from '@/pages/public/PublicForm_ErfahrungsraumFormate';
import PublicFormSitzungen from '@/pages/public/PublicForm_Sitzungen';
import PublicFormBewertungen from '@/pages/public/PublicForm_Bewertungen';
// <public:imports>
// </public:imports>
// <custom:imports>
const SitzungPlanenPage = lazy(() => import('@/pages/intents/SitzungPlanenPage'));
const BewertungsrundePage = lazy(() => import('@/pages/intents/BewertungsrundePage'));
// </custom:imports>

export default function App() {
  return (
    <ErrorBoundary>
      <ErrorBusProvider>
        <HashRouter>
          <ActionsProvider>
            <Routes>
              <Route path="public/6a5732837233ac731b9d8400" element={<PublicFormTeilnehmer />} />
              <Route path="public/6a573287887b7fd750dcce20" element={<PublicFormErfahrungsraumFormate />} />
              <Route path="public/6a573288cd157e1946410884" element={<PublicFormSitzungen />} />
              <Route path="public/6a573289304dfda38cab4969" element={<PublicFormBewertungen />} />
              {/* <public:routes> */}
              {/* </public:routes> */}
              <Route element={<Layout />}>
                <Route index element={<DashboardOverview />} />
                <Route path="teilnehmer" element={<TeilnehmerPage />} />
                <Route path="teilnehmer/:id" element={<TeilnehmerDetailPage />} />
                <Route path="erfahrungsraum-formate" element={<ErfahrungsraumFormatePage />} />
                <Route path="erfahrungsraum-formate/:id" element={<ErfahrungsraumFormateDetailPage />} />
                <Route path="sitzungen" element={<SitzungenPage />} />
                <Route path="sitzungen/:id" element={<SitzungenDetailPage />} />
                <Route path="bewertungen" element={<BewertungenPage />} />
                <Route path="bewertungen/:id" element={<BewertungenDetailPage />} />
                <Route path="admin" element={<AdminPage />} />
                {/* <custom:routes> */}
                <Route path="intents/sitzung-planen" element={<Suspense fallback={null}><SitzungPlanenPage /></Suspense>} />
                <Route path="intents/bewertungsrunde" element={<Suspense fallback={null}><BewertungsrundePage /></Suspense>} />
                {/* </custom:routes> */}
              </Route>
            </Routes>
          </ActionsProvider>
        </HashRouter>
      </ErrorBusProvider>
    </ErrorBoundary>
  );
}
