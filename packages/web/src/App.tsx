import {
  AppShell,
  Badge,
  Burger,
  Group,
  NavLink,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconChartHistogram, IconCoins, IconUsers } from '@tabler/icons-react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { InsightsPage } from './features/insights/InsightsPage';
import { DirectoryPage } from './features/directory/DirectoryPage';
import { EmployeePage } from './features/employee/EmployeePage';
import { ThemeToggle } from './components/ThemeToggle';
import { useReferenceData } from './api/queries';

const NAVIGATION = [
  {
    to: '/insights',
    label: 'Insights',
    description: 'How the org pays',
    icon: IconChartHistogram,
  },
  {
    to: '/employees',
    label: 'Employees',
    description: 'Find and manage people',
    icon: IconUsers,
  },
];

export function App() {
  const [opened, { toggle, close }] = useDisclosure();
  const location = useLocation();
  const reference = useReferenceData();

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 240, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="lg"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <ThemeIcon size={34} radius="md" variant="light">
              <IconCoins size={20} />
            </ThemeIcon>
            <div>
              <Title order={4} lh={1.1}>
                ACME
              </Title>
              <Text size="xs" c="dimmed" lh={1.1}>
                Salary Management
              </Text>
            </div>
          </Group>

          <Group gap="sm" wrap="nowrap">
            {reference.data && (
              <Badge variant="light" color="gray" visibleFrom="md">
                {reference.data.countries.length} countries · rates {reference.data.fx.asOf}
              </Badge>
            )}
            <ThemeToggle />
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="sm">
        <Stack gap={2}>
          <Text
            size="xs"
            fw={600}
            c="dimmed"
            tt="uppercase"
            px="xs"
            pb={6}
            style={{ letterSpacing: 0.5 }}
          >
            Workspace
          </Text>
          {NAVIGATION.map((item) => (
            <NavLink
              key={item.to}
              component={Link}
              to={item.to}
              label={item.label}
              description={item.description}
              leftSection={<item.icon size={18} />}
              active={location.pathname.startsWith(item.to)}
              onClick={close}
              variant="light"
            />
          ))}
        </Stack>

        <Text size="xs" c="dimmed" mt="auto" px="xs" pb="xs">
          Every figure comparable across countries is converted to{' '}
          {reference.data?.fx.baseCurrency ?? 'USD'} at pinned rates.
        </Text>
      </AppShell.Navbar>

      <AppShell.Main>
        <Routes>
          <Route path="/" element={<Navigate to="/insights" replace />} />
          <Route path="/insights" element={<InsightsPage />} />
          <Route path="/employees" element={<DirectoryPage />} />
          <Route path="/employees/:id" element={<EmployeePage />} />
          <Route path="*" element={<Navigate to="/insights" replace />} />
        </Routes>
      </AppShell.Main>
    </AppShell>
  );
}
