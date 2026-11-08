import type {
    DidaHabit,
    DidaHabitCheckin,
    DidaHabitCheckinData,
    DidaHabitWrite,
} from "../features/habits/models";
import { DidaHttpClient } from "./http-client";

export class DidaHabitApi {
    constructor(private readonly http: DidaHttpClient) {}

    getHabit(habitId: string): Promise<DidaHabit> {
        return this.http.request(`/habit/${habitId}`);
    }

    getHabits(): Promise<DidaHabit[]> {
        return this.http.request("/habit");
    }

    createHabit(input: DidaHabitWrite): Promise<DidaHabit> {
        return this.http.request("/habit", { method: "POST", body: JSON.stringify(input) });
    }

    updateHabit(habitId: string, input: Partial<DidaHabitWrite>): Promise<DidaHabit> {
        return this.http.request(`/habit/${habitId}`, { method: "POST", body: JSON.stringify(input) });
    }

    checkIn(habitId: string, input: DidaHabitCheckinData): Promise<DidaHabitCheckin> {
        return this.http.request(`/habit/${habitId}/checkin`, { method: "POST", body: JSON.stringify(input) });
    }

    getCheckins(habitIds: string[], from: number, to: number): Promise<DidaHabitCheckin[]> {
        const query = new URLSearchParams({ habitIds: habitIds.join(","), from: String(from), to: String(to) });
        return this.http.request(`/habit/checkins?${query.toString()}`);
    }
}
