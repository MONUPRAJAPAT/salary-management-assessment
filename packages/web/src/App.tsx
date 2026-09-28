import { AppShell, Badge, Burger, Group, NavLink, Text, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconChartHistogram, IconUsers } from '@tabler/icons-react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { InsightsPage } from './features/insights/InsightsPage';
import { DirectoryPage } from './features/directory/DirectoryPage';
import { EmployeePage } from './features/employee/EmployeePage';
import { useReferenceData } from './api/queries';

const NAVIGATION = [
  { to: '/insights', label: 'Insights', icon: IconChartHistogram },
  { to: '/employees', label: 'Employees', icon: IconUsers },
];

export function App() {
  const [opened, { toggle, close }] = useDisclosure();
  const location = useLocation();
  const reference = useReferenceData();

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 220, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="lg"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Title order={4} fw={600}>
              ACME{' '}
              <Text span c="dimmed" fw={400}>
                Salary Management
              </Text>
            </Title>
          </Group>
          {reference.data && (
            <Badge variant="light" color="gray" visibleFrom="sm">
              {reference.data.countries.length} countries · rates as of {reference.data.fx.asOf}
            </Badge>
          )}
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="sm">
        {NAVIGATION.map((item) => (
          <NavLink
            key={item.to}
            component={Link}
            to={item.to}
            label={item.label}
            leftSection={<item.icon size={18} />}
            active={location.pathname.startsWith(item.to)}
            onClick={close}
          />
        ))}
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
