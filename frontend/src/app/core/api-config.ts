import { isDevMode } from '@angular/core';

export const API_BASE_URL = isDevMode() ? 'http://localhost:4000/api' : 'https://ronostico-api.onrender.com/api';
