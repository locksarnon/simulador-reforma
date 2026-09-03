import axios from 'axios';

/**
 * Cliente do backend próprio (self-hosted), substitui o SDK hospedado do
 * Base44 (@base44/sdk). Mantém o mesmo formato `export const base44 = {...}`
 * e a mesma superfície de métodos (entities/auth/functions/integrations)
 * usada em todo o app, para que nenhuma página/hook precise mudar.
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3003/api/v1';

const ACCESS_TOKEN_KEY = 'sr_access_token';
const REFRESH_TOKEN_KEY = 'sr_refresh_token';

function getAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

function getRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

function storeTokens({ accessToken, refreshToken }) {
  if (accessToken) localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  if (refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

function clearTokens() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

const http = axios.create({ baseURL: API_URL });

http.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Renova o access token automaticamente em 401 (exceto nas próprias rotas
// de auth, para evitar loop) usando o refresh token armazenado.
let refreshing = null;
http.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const isAuthRoute = original?.url?.startsWith('/auth/');
    if (error.response?.status === 401 && !isAuthRoute && !original._retried) {
      const refreshToken = getRefreshToken();
      if (!refreshToken) {
        clearTokens();
        return Promise.reject(error);
      }
      original._retried = true;
      try {
        refreshing = refreshing || http.post('/auth/refresh', { refreshToken });
        const { data } = await refreshing;
        refreshing = null;
        storeTokens(data);
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return http(original);
      } catch (refreshErr) {
        refreshing = null;
        clearTokens();
        return Promise.reject(refreshErr);
      }
    }
    return Promise.reject(error);
  },
);

function unwrapError(err) {
  const message = err?.response?.data?.message || err?.message || 'Erro inesperado.';
  const wrapped = new Error(Array.isArray(message) ? message.join(', ') : message);
  wrapped.status = err?.response?.status;
  wrapped.response = err?.response;
  return wrapped;
}

function makeEntityClient(name) {
  return {
    async list() {
      try {
        const { data } = await http.get(`/entities/${name}`);
        return data;
      } catch (err) {
        throw unwrapError(err);
      }
    },
    async filter(query = {}, sort, limit) {
      try {
        const { data } = await http.post(`/entities/${name}/query`, { filter: query, sort, limit });
        return data;
      } catch (err) {
        throw unwrapError(err);
      }
    },
    async get(id) {
      try {
        const { data } = await http.get(`/entities/${name}/${id}`);
        return data;
      } catch (err) {
        throw unwrapError(err);
      }
    },
    async create(payload) {
      try {
        const { data } = await http.post(`/entities/${name}`, payload);
        return data;
      } catch (err) {
        throw unwrapError(err);
      }
    },
    async update(id, payload) {
      try {
        const { data } = await http.put(`/entities/${name}/${id}`, payload);
        return data;
      } catch (err) {
        throw unwrapError(err);
      }
    },
    async delete(id) {
      try {
        const { data } = await http.delete(`/entities/${name}/${id}`);
        return data;
      } catch (err) {
        throw unwrapError(err);
      }
    },
    async bulkCreate(rows) {
      try {
        const { data } = await http.post(`/entities/${name}/bulk-create`, rows);
        return data;
      } catch (err) {
        throw unwrapError(err);
      }
    },
    async bulkUpdate(rows) {
      try {
        const { data } = await http.post(`/entities/${name}/bulk-update`, rows);
        return data;
      } catch (err) {
        throw unwrapError(err);
      }
    },
  };
}

const ENTITY_NAMES = [
  'Grupo', 'Empresa', 'Operacao', 'Cenario', 'TransicaoAno', 'ClassTrib',
  'CstIbsCbs', 'CredPres', 'Configuracao', 'Diagnostico',
  'ImportacaoXMLLote', 'ImportacaoXMLArquivo', 'ImportacaoXMLItem', 'HistoricoXML',
  'Simulacao', 'Ncm', 'Cfop', 'BeneficioFiscal', 'CorrelacaoServico', 'NoticiaReforma',
];

const entities = Object.fromEntries(ENTITY_NAMES.map((name) => [name, makeEntityClient(name)]));

const FUNCTION_ROUTES = {
  processarLoteXML: '/xml/processar-lote',
  confirmarImportacaoXML: '/xml/confirmar-importacao',
  reprocessarLoteXML: '/xml/reprocessar-lote',
  buscarAtualizacoesNoticias: '/noticias/buscar-atualizacoes',
  validarNfse: '/validador-nfse/validar',
};

export const base44 = {
  entities,

  auth: {
    async me() {
      if (!getAccessToken()) return null;
      try {
        const { data } = await http.get('/auth/me');
        return data;
      } catch (err) {
        throw unwrapError(err);
      }
    },
    async loginViaEmailPassword(email, password) {
      try {
        const { data } = await http.post('/auth/login', { email, password });
        storeTokens(data);
        return data.user;
      } catch (err) {
        throw unwrapError(err);
      }
    },
    async register({ email, password, name }) {
      try {
        const { data } = await http.post('/auth/register', { email, password, name });
        storeTokens(data);
        return data;
      } catch (err) {
        throw unwrapError(err);
      }
    },
    async resetPasswordRequest(email) {
      try {
        const { data } = await http.post('/auth/reset-password-request', { email });
        return data;
      } catch (err) {
        throw unwrapError(err);
      }
    },
    async resetPassword({ resetToken, newPassword }) {
      try {
        const { data } = await http.post('/auth/reset-password', { resetToken, newPassword });
        return data;
      } catch (err) {
        throw unwrapError(err);
      }
    },
    setToken(accessToken) {
      storeTokens({ accessToken });
    },
    logout(redirectUrl) {
      const refreshToken = getRefreshToken();
      clearTokens();
      if (refreshToken) {
        http.post('/auth/logout', { refreshToken }).catch(() => {});
      }
      if (redirectUrl) window.location.href = redirectUrl;
    },
  },

  functions: {
    async invoke(name, payload) {
      const route = FUNCTION_ROUTES[name];
      if (!route) throw new Error(`Função desconhecida: ${name}`);
      try {
        const { data } = await http.post(route, payload);
        return { data };
      } catch (err) {
        throw unwrapError(err);
      }
    },
  },

  integrations: {
    Core: {
      async UploadFile({ file }) {
        const form = new FormData();
        form.append('file', file);
        try {
          const { data } = await http.post('/uploads', form, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          return data;
        } catch (err) {
          throw unwrapError(err);
        }
      },
      async ConsultarCNPJ(cnpj) {
        try {
          const { data } = await http.get(`/cnpj/${cnpj}`);
          return data;
        } catch (err) {
          throw unwrapError(err);
        }
      },
    },
  },
};
