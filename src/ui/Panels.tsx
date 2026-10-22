import React from 'react';
import { Box, Text } from 'ink';
import type { ModelShare, Overview, Ranked } from '../types.js';
import { INDENT, type Panel } from '../layout.js';
import { BLOCK, fit } from '../format.js';

const GAP = 1;
const SHARE_BAR = 6;

const TITLES: Record<Panel, string> = { skills: 'TOP SKILLS', tools: 'TOOLS', models: 'MODELS' };

interface Props {
  overview: Overview;
  panels: Panel[];
  rows: number;
  width: number;
  palette: Map<string, string>;
}

export function Panels({ overview, panels, rows, width, palette }: Props) {
  const panelWidth = Math.floor((width - GAP * (panels.length - 1)) / panels.length);
  return (
    <Box gap={GAP}>
      {panels.map((panel) => (
        <Box key={panel} flexDirection="column" width={panelWidth} flexShrink={0}>
          <Text bold wrap="truncate-end">
            {TITLES[panel]} <Text color="gray">· {overview.period}</Text>
          </Text>
          <Box flexDirection="column" paddingLeft={INDENT}>
            <Items panel={panel} overview={overview} rows={rows} width={panelWidth - INDENT} palette={palette} />
          </Box>
        </Box>
      ))}
    </Box>
  );
}

interface ItemsProps {
  panel: Panel;
  overview: Overview;
  rows: number;
  width: number;
  palette: Map<string, string>;
}

function Items({ panel, overview, rows, width, palette }: ItemsProps) {
  if (panel === 'models') {
    const models = overview.models.slice(0, rows);
    if (models.length === 0) return <Text color="gray">none</Text>;
    return models.map((m) => <ModelRow key={m.name} model={m} width={width} color={palette.get(m.name)} />);
  }
  const items = (panel === 'skills' ? overview.topSkills : overview.topTools).slice(0, rows);
  if (items.length === 0) return <Text color="gray">none</Text>;
  return items.map((item) => <RankedRow key={item.name} item={item} width={width} />);
}

function RankedRow({ item, width }: { item: Ranked; width: number }) {
  const count = String(item.count);
  const prefix = item.server ? 'mcp ' : '';
  const name = fit(item.server ?? item.name, width - prefix.length - count.length - 1);
  return (
    <Text wrap="truncate-end">
      {prefix && <Text color="yellow">{prefix}</Text>}
      {name} <Text color="gray">{count}</Text>
    </Text>
  );
}

function ModelRow({ model, width, color }: { model: ModelShare; width: number; color?: string }) {
  const percent = `${Math.round(model.share * 100)}%`.padStart(4);
  const filled = Math.round(model.share * SHARE_BAR);
  const name = fit(model.name, width - percent.length - SHARE_BAR - 2);
  return (
    <Text wrap="truncate-end">
      <Text color={color}>{name}</Text> {percent}{' '}
      <Text color={color}>{BLOCK.repeat(filled)}</Text>
      <Text color="gray">{'─'.repeat(SHARE_BAR - filled)}</Text>
    </Text>
  );
}
