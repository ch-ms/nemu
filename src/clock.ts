export interface Clock {
    resume: () => void;
    suspend: () => void;
    readonly isRunning: boolean;
}
