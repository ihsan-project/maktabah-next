import { getAdminDb } from '@/lib/server/firebase-admin';

export interface DailyUsage {
  date: string;
  requests: number;
  tools: Record<string, number>;
}

export async function getUsageData(keyHash: string, days = 7): Promise<DailyUsage[]> {
  const db = getAdminDb();

  const dates: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }

  const snapshot = await db
    .collection('apiKeys')
    .doc(keyHash)
    .collection('usage')
    .where('date', 'in', dates.slice(0, 10))
    .get();

  const usageMap = new Map<string, DailyUsage>();
  snapshot.docs.forEach((doc) => {
    const data = doc.data();
    usageMap.set(data.date, {
      date: data.date,
      requests: data.requests || 0,
      tools: data.tools || {},
    });
  });

  return dates
    .map((date) => usageMap.get(date) || { date, requests: 0, tools: {} })
    .reverse();
}
