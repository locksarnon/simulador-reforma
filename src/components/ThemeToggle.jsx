import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      title={isDark ? "Modo claro" : "Modo escuro"}
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </Button>
  );
}