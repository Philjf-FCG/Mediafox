interface EmailOptions {
    to: string;
    subject: string;
    html: string;
}
export declare const sendEmail: (opts: EmailOptions) => Promise<void>;
export declare const notifyPostPublished: (email: string, postTitle: string, platforms: string[]) => Promise<void>;
export declare const notifyPostFailed: (email: string, postTitle: string, error: string) => Promise<void>;
export {};
//# sourceMappingURL=email.d.ts.map