// app/index.tsx
import { Redirect } from "expo-router";
import { useSelector } from "react-redux";

export default function Index() {
  const token = useSelector((s: any) => s?.auth?.userInfo?.token);
  return <Redirect href={token ? "/home" : "/login"} />;
}
