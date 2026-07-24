export interface DidaHabit {
    id: string;
    name: string;
    iconRes?: string;
    color?: string;
    sortOrder?: number;
    status?: number;
    encouragement?: string;
    totalCheckIns?: number;
    createdTime?: string;
    modifiedTime?: string;
    archivedTime?: string;
    type?: string;
    goal?: number;
    step?: number;
    unit?: string;
    etag?: string;
    repeatRule?: string;
    reminders?: string[];
    recordEnable?: boolean;
    sectionId?: string;
    targetDays?: number;
    targetStartDate?: number;
    completedCycles?: number;
    exDates?: string[];
    style?: number;
}

export type DidaHabitWrite = Partial<Omit<DidaHabit, "id" | "totalCheckIns" | "createdTime" | "modifiedTime" | "archivedTime" | "etag">> & {
    name: string;
};

export interface DidaHabitCheckinData {
    id?: string;
    stamp: number;
    time?: string;
    opTime?: string;
    value?: number;
    goal?: number;
    status?: number;
}

export interface DidaHabitCheckin {
    id: string;
    habitId: string;
    createdTime?: string;
    modifiedTime?: string;
    etag?: string;
    year?: number;
    checkins?: DidaHabitCheckinData[];
}
