import { ConfigHealthDashboard } from '@/components/config/ConfigHealthDashboard';

export function ConfigurationTile() {
  return (
    <section className="card-glass settings-panel rounded-xl p-5">
      <h2 className="text-sm font-medium uppercase tracking-wider text-primary mb-5">
        Configuration
      </h2>
      <ConfigHealthDashboard />
    </section>
  );
}
