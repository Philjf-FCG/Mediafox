import { NextFunction, Request, Response } from 'express';
export interface MediaFoxUser {
    userId: string;
    email: string;
    name: string;
    role: 'admin' | 'user';
}
interface FoxAuthClaims {
    sub: string;
    email: string;
    name: string;
    role: 'admin' | 'user';
    approved: boolean;
}
export declare const AUTH_COOKIE = "mediafox_auth";
export declare const CSRF_COOKIE = "mediafox_csrf";
export declare const CSRF_HEADER = "x-csrf-token";
export declare const isAuthEnabled: () => boolean;
export declare const issueAuthToken: (user: MediaFoxUser) => string;
export declare const setAuthCookie: (req: Request, res: Response, token: string) => void;
export declare const clearAuthCookie: (req: Request, res: Response) => void;
export declare const issueCsrfToken: (req: Request, res: Response) => string;
export declare const hasValidCsrfToken: (req: Request) => boolean;
export declare const parseOwnAuthToken: (req: Request) => MediaFoxUser | null;
export declare const parseFoxAuthToken: (req: Request) => FoxAuthClaims | null;
export declare const requireAuth: (req: Request, res: Response, next: NextFunction) => void;
declare global {
    namespace Express {
        interface Request {
            mediafoxUser?: MediaFoxUser;
            studioId?: string;
        }
    }
}
export {};
//# sourceMappingURL=auth.d.ts.map