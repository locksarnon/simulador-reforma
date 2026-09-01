import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider } from '@/lib/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import ScrollToTop from './components/ScrollToTop';
import Layout from '@/components/Layout';
import ThemeProvider from '@/components/ThemeProvider';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import Home from '@/pages/Home';
import DataHub from '@/pages/DataHub';
import Workroom from '@/pages/Workroom';
import WorkroomOverview from '@/pages/WorkroomOverview';
import OperacoesPage from '@/pages/OperacoesPage';
import ImportacaoXMLPage from '@/pages/ImportacaoXMLPage';
import EmpresasPage from '@/pages/EmpresasPage';
import EmpresaWorkroom from '@/pages/EmpresaWorkroom';
import EmpresaPainel from '@/pages/EmpresaPainel';
import CenariosPage from '@/pages/CenariosPage';
import TransicaoPage from '@/pages/TransicaoPage';
import CatalogosPage from '@/pages/CatalogosPage';
import ConfiguracaoPage from '@/pages/ConfiguracaoPage';
import ManualPage from '@/pages/ManualPage';
import ArquiteturaPage from '@/pages/ArquiteturaPage';
import FerramentasClassificacao from '@/pages/FerramentasClassificacao';
import FerramentasCalculadora from '@/pages/FerramentasCalculadora';
import FerramentasArt11 from '@/pages/FerramentasArt11';
import FerramentasNoticias from '@/pages/FerramentasNoticias';
// Add page imports here

function App() {

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <ScrollToTop />
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />

              <Route element={<ProtectedRoute />}>
                <Route element={<Layout />}>
                  <Route path="/" element={<DataHub />} />
                  <Route path="/cockpit" element={<Home />} />
                  <Route path="/workroom/:id" element={<Workroom />}>
                    <Route index element={<WorkroomOverview />} />
                    <Route path="empresas" element={<EmpresasPage />} />
                    <Route path="operacoes" element={<OperacoesPage />} />
                    <Route path="importacao-xml" element={<ImportacaoXMLPage />} />
                    <Route path="empresas/:empresaId" element={<EmpresaWorkroom />}>
                      <Route index element={<EmpresaPainel />} />
                      <Route path="operacoes" element={<OperacoesPage />} />
                      <Route path="importacao-xml" element={<ImportacaoXMLPage />} />
                    </Route>
                  </Route>
                  <Route path="/cenarios" element={<CenariosPage />} />
                  <Route path="/transicao" element={<TransicaoPage />} />
                  <Route path="/catalogos" element={<CatalogosPage />} />
                  <Route path="/configuracao" element={<ConfiguracaoPage />} />
                  <Route path="/ferramentas/classificacao" element={<FerramentasClassificacao />} />
                  <Route path="/ferramentas/calculadora" element={<FerramentasCalculadora />} />
                  <Route path="/ferramentas/art-11" element={<FerramentasArt11 />} />
                  <Route path="/ferramentas/noticias" element={<FerramentasNoticias />} />
                  <Route path="/manual" element={<ManualPage />} />
                  <Route path="/arquitetura" element={<ArquiteturaPage />} />
                </Route>
              </Route>

              <Route path="*" element={<PageNotFound />} />
            </Routes>
            <Toaster />
          </Router>
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App
