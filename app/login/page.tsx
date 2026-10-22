"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";
import { Eye, EyeOff, Mail, Lock, CheckSquare, ArrowLeft } from "lucide-react";
import Footer from "@/components/layout/Footer";
import { toast } from "@/lib/toast";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("deactivated") === "true") {
        setError("Your account has been deactivated. Please contact an administrator.");
      }
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Email and password are required");
      return;
    }

    setLoading(true);

    if (typeof document !== 'undefined') {
      const rememberValue = rememberMe ? 'true' : 'false';
      const maxAgeStr = rememberMe ? '; max-age=31536000' : '';
      document.cookie = `sb-remember-me=${rememberValue}; path=/${maxAgeStr}; SameSite=Lax`;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setError("Invalid email or password. Please try again.");
      toast("Invalid email or password. Please try again.", "error");
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session) {
      let { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role, portal_access, is_active")
        .eq("id", session.user.id)
        .single();

      if (profileError) {
        const fallback = await supabase
          .from("profiles")
          .select("role")
          .eq("id", session.user.id)
          .single();
        profile = { ...fallback.data, portal_access: [], is_active: true };
      }

      if (profile && profile.is_active === false) {
        await supabase.auth.signOut();
        setError("Your account has been deactivated. Please contact an administrator.");
        toast("Your account has been deactivated. Please contact an administrator.", "error");
        return;
      }

      const role = profile?.role?.toLowerCase();
      const isLendingRole = role === "lending" || role === "accurate_lending";
      const isMortgageRole = role === "mortgage";

      let portalAccess: string[] = profile?.portal_access || [];

      if (
        portalAccess.length === 0 ||
        (portalAccess.length === 1 && portalAccess[0] === "insurance")
      ) {
        if (
          session.user.email?.toLowerCase().includes("moonstar.com") ||
          isMortgageRole
        ) {
          portalAccess = ["mortgage"];
        } else if (
          session.user.email?.toLowerCase().includes("accuratelending.com") ||
          isLendingRole
        ) {
          portalAccess = ["lending"];
        } else if (portalAccess.length === 0) {
          portalAccess = ["insurance"];
        }
      }

      const hasInsuranceAccess =
        portalAccess.includes("insurance") || role === "superadmin";

      if (hasInsuranceAccess && role) {
        const roleRoutes: Record<string, string> = {
          csr: "/csr",
          admin: "/admin",
          accounting: "/accounting",
          superadmin: "/superadmin",
        };
        if (roleRoutes[role]) {
          toast(
            `Welcome back! Redirecting to your dashboard...`,
            "success",
            3000,
          );
          router.push(roleRoutes[role]);
          return;
        }
      }

      // If authenticated but lacks permission for Innovative Insurance portal
      await supabase.auth.signOut();
      setError("Your account does not have access to this portal.");
      toast("Your account does not have access to this portal.", "error");
      return;
    }

    await supabase.auth.signOut();
    setError("Invalid email or password. Please try again.");
    toast("Invalid email or password. Please try again.", "error");
    return;
  };

  return (
    <div className="min-h-dvh flex flex-col font-sans pb-safe relative overflow-hidden lg:overflow-visible">
      {/* Mobile Back to Home Link */}
      <button
        type="button"
        onClick={() => router.push("/")}
        title="Back to Home"
        aria-label="Back to Home"
        className="lg:hidden absolute top-5 left-5 z-30 p-3 rounded-full bg-white/15 hover:bg-white/25 border border-white/30 hover:border-white/50 text-white transition-all duration-300 backdrop-blur-md shadow-sm hover:shadow group flex items-center justify-center"
      >
        <ArrowLeft
          size={20}
          className="transition-transform duration-300 group-hover:-translate-x-0.5"
        />
      </button>

      {/* Mobile-only background gradient wrapper */}
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500 to-teal-700 lg:hidden -z-20 overflow-hidden">
        <div className="absolute top-0 right-0 w-64 md:w-96 h-full bg-white/10 skew-x-12 translate-x-32 rounded-l-3xl backdrop-blur-sm pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-teal-400/30 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-[40rem] h-[40rem] bg-emerald-400/20 rounded-full blur-3xl" />
        </div>
      </div>

      {/* Desktop-only background color wrapper */}
      <div className="absolute inset-0 bg-gray-50/50 hidden lg:block -z-20"></div>

      <div className="flex-1 flex flex-col lg:flex-row w-full z-10">
        {/* LEFT SIDE (40%) - Branding (Desktop Only) */}
        <div className="hidden lg:flex w-full lg:w-[40%] bg-gradient-to-br from-emerald-500 to-teal-700 relative overflow-hidden flex-col justify-center px-12 lg:px-16 text-white shrink-0 shadow-lg lg:shadow-2xl z-10">
          {/* Back to Home Link */}
          <button
            type="button"
            onClick={() => router.push("/")}
            className="absolute top-8 left-12 z-30 flex items-center gap-2 px-4 py-2 rounded-full bg-white/15 hover:bg-white/25 border border-white/30 hover:border-white/50 text-white text-sm font-medium transition-all duration-300 backdrop-blur-md shadow-sm hover:shadow group"
          >
            <span className="transition-transform duration-300 group-hover:-translate-x-1">
              ←
            </span>
            <span>Back to Home</span>
          </button>
          {/* Geometric Shapes */}
          <div className="absolute top-0 right-0 w-48 h-full bg-white/10 skew-x-12 translate-x-24 rounded-l-3xl backdrop-blur-sm"></div>
          <div className="absolute -bottom-10 -left-10 w-72 h-72 bg-teal-400/30 rounded-full blur-3xl"></div>
          <div className="absolute top-10 left-1/2 w-32 h-32 bg-emerald-300/20 rounded-full blur-2xl"></div>

          <div className="relative z-20 max-w-xl mx-auto lg:mx-0 w-full text-left">
            <img
              src="/innovative_logo_-removebg-preview.png"
              alt="Innovative Insurance Logo"
              className="h-16 lg:h-20 w-auto object-contain mb-4 drop-shadow-sm"
            />
            <h1 className="text-5xl lg:text-6xl font-extrabold tracking-tight mb-2 drop-shadow-sm">
              INNOVATIVE
            </h1>
            <h2 className="text-2xl font-medium text-emerald-50 mb-6">
              Insurance
            </h2>
            <div className="w-16 h-1 bg-emerald-300 rounded-full mb-8"></div>
            <p className="text-lg text-emerald-100 max-w-md leading-relaxed drop-shadow-sm">
              Streamline your workflow, manage client relationships effectively,
              and close more deals with our integrated dashboard solution.
            </p>
          </div>
        </div>

        {/* RIGHT SIDE (60%) - Login Form */}
        <div className="w-full lg:w-[60%] flex flex-col items-center justify-center p-4 sm:p-6 lg:p-12 relative flex-1">
          {/* Decorative background blurs for right side */}
          <div className="hidden lg:block absolute top-10 right-10 w-64 h-64 bg-teal-100/40 rounded-full blur-3xl -z-10"></div>
          <div className="hidden lg:block absolute bottom-10 left-10 w-64 h-64 bg-emerald-100/40 rounded-full blur-3xl -z-10"></div>

          {/* MOBILE BRANDING (Visible only on mobile, centered above the card) */}
          <div className="lg:hidden flex flex-col items-center justify-center text-white mb-6 sm:mb-8 text-center drop-shadow-md z-10 w-full mt-2 sm:mt-6">
            <img
              src="/innovative_logo_-removebg-preview.png"
              alt="Innovative Insurance Logo"
              className="h-12 sm:h-14 w-auto object-contain mb-2 drop-shadow-sm"
            />
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-1">
              INNOVATIVE
            </h1>
            <h2 className="text-lg sm:text-xl font-medium text-emerald-100">
              Insurance
            </h2>
          </div>

          <div className="w-full max-w-md bg-white/95 lg:bg-white/70 backdrop-blur-2xl lg:backdrop-blur-xl rounded-[2rem] sm:rounded-[2.5rem] lg:rounded-3xl shadow-[0_20px_40px_-10px_rgba(0,0,0,0.2)] lg:shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-white/40 lg:border-white/60 p-6 sm:p-8 lg:p-10 relative z-10 transition-all duration-300 lg:hover:shadow-[0_8px_40px_rgb(0,0,0,0.08)]">
            <div className="text-center mb-6 lg:mb-8">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 lg:text-gray-800 tracking-tight">
                Sign In
              </h2>
              <p className="text-sm sm:text-base text-gray-600 lg:text-gray-500 mt-1.5 font-medium">
                Enter your credentials to access your account
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4 sm:space-y-5">
              {/* Email Input */}
              <div className="space-y-1.5">
                <label htmlFor="login-email" className="text-xs sm:text-sm font-semibold text-gray-700 block ml-1">
                  Email Address
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-500 group-focus-within:text-teal-500 transition-colors">
                    <Mail size={18} aria-hidden="true" />
                  </div>
                  <input
                    id="login-email"
                    type="email"
                    autoComplete="username"
                    placeholder="name@company.com"
                    className="w-full pl-10 pr-4 py-3 bg-gray-50/50 hover:bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all duration-300 text-sm shadow-sm"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              {/* Password Input */}
              <div className="space-y-1.5">
                <label htmlFor="login-password" className="text-xs sm:text-sm font-semibold text-gray-700 block ml-1">
                  Password
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-500 group-focus-within:text-teal-500 transition-colors">
                    <Lock size={18} aria-hidden="true" />
                  </div>
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="......"
                    className="w-full pl-10 pr-12 py-3 bg-gray-50/50 hover:bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all duration-300 text-sm shadow-sm"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    aria-controls="login-password"
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-500 hover:text-teal-600 transition-colors"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {/* Remember Me & Forgot Password */}
              <div className="flex items-center justify-between text-sm pt-2 pb-1">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div className="relative flex items-center">
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={rememberMe}
                      onChange={() => setRememberMe(!rememberMe)}
                    />
                    <div
                      className={`w-4 h-4 border rounded transition-all duration-200 flex items-center justify-center peer-focus-visible:ring-2 peer-focus-visible:ring-teal-500 peer-focus-visible:ring-offset-2 
                                    ${rememberMe ? "bg-teal-500 border-teal-500 text-white shadow-sm" : "border-gray-300 bg-gray-50/50 text-transparent group-hover:border-teal-400"}
                                `}
                    >
                      <CheckSquare
                        size={12}
                        className={
                          rememberMe
                            ? "block scale-100"
                            : "hidden scale-0 transition-transform"
                        }
                      />
                    </div>
                  </div>
                  <span className="text-gray-600 font-medium group-hover:text-gray-800 transition-colors">
                    Remember me
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => router.push('/forgot-password')}
                  className="text-teal-700 hover:text-teal-800 font-semibold transition-colors hover:underline underline-offset-2"
                >
                  Forgot password?
                </button>
              </div>

              {/* Error Message */}
              {error && (
                <div role="alert" aria-live="assertive" className="p-3 bg-red-50/80 backdrop-blur-sm border border-red-200 text-red-600 text-sm font-medium rounded-xl text-center animate-fade-in shadow-sm">
                  {error}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-semibold py-3.5 rounded-xl transition-all duration-300 shadow-[0_4px_14px_0_rgba(13,148,136,0.39)] hover:shadow-[0_6px_20px_rgba(13,148,136,0.23)] hover:-translate-y-[1px] disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none mt-2"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg
                      className="animate-spin -ml-1 mr-2 h-5 w-5 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Logging in...
                  </span>
                ) : (
                  "Submit"
                )}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Optimized footer wrapper for better mobile alignment */}
      <div className="w-full shrink-0 z-10 relative">
        <Footer />
      </div>
    </div>
  );
}
