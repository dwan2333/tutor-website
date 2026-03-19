import axios from 'axios';

const api = axios.create({ baseURL: 'http://localhost:8000' });

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Types ────────────────────────────────────────────────────────────────────

export interface User {
  id: number;
  username: string;
  email: string;
  created_at: string;
}

export interface Document {
  id: number;
  user_id: number;
  filename: string;
  original_name: string;
  page_count: number;
  selected_start: number | null;
  selected_end: number | null;
  status: string;
  error_message: string | null;
  created_at: string;
}

export interface ContextCard {
  id: number;
  document_id: number;
  title: string;
  summary: string;
  page_range_start: number;
  page_range_end: number;
  model_used: string;
  order_index: number;
  created_at: string;
}

export interface ChatMessage {
  id: number;
  card_id: number;
  role: string;
  content: string;
  created_at: string;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export const register = (username: string, email: string, password: string) =>
  api.post<User>('/api/auth/register', { username, email, password });

export const login = async (username: string, password: string): Promise<void> => {
  const form = new FormData();
  form.append('username', username);
  form.append('password', password);
  const res = await api.post<{ access_token: string; token_type: string }>(
    '/api/auth/login',
    form,
  );
  localStorage.setItem('token', res.data.access_token);
};

export const getMe = () => api.get<User>('/api/auth/me');

export const logout = () => {
  localStorage.removeItem('token');
};

export const isLoggedIn = (): boolean => {
  if (typeof window === 'undefined') return false;
  return !!localStorage.getItem('token');
};

export const getToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
};

// ── Documents ─────────────────────────────────────────────────────────────────

export const uploadDocument = (file: File) => {
  const form = new FormData();
  form.append('file', file);
  return api.post<Document>('/api/documents/upload', form);
};

export const getDocuments = () => api.get<Document[]>('/api/documents/');

export const getDocument = (id: number) => api.get<Document>(`/api/documents/${id}`);

export const deleteDocument = (id: number) => api.delete(`/api/documents/${id}`);

export const updatePages = (id: number, start: number, end: number) =>
  api.put<Document>(`/api/documents/${id}/pages`, {
    start_page: start,
    end_page: end,
  });

export const generateCards = (documentId: number) =>
  api.post<{ message: string; document_id: number }>('/api/documents/generate-cards', {
    document_id: documentId,
    model: 'claude',
  });

export const getDocumentStatus = (id: number) =>
  api.get<{ status: string; error_message: string | null }>(`/api/documents/${id}/status`);

export const getThumbnailUrl = (docId: number, pageNum: number): string =>
  `http://localhost:8000/api/documents/${docId}/thumbnail/${pageNum}`;

// ── Context Cards ─────────────────────────────────────────────────────────────

export const getCards = (docId: number) =>
  api.get<ContextCard[]>(`/api/cards/document/${docId}`);

export const generateDiagram = (cardId: number, diagramType: string) =>
  api.post<{ mermaid_code: string }>(`/api/cards/${cardId}/diagram`, {
    diagram_type: diagramType,
  });

export const getChatMessages = (cardId: number) =>
  api.get<ChatMessage[]>(`/api/cards/${cardId}/messages`);

export default api;
