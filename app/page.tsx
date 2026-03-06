'use client';

import React from 'react';
import Link from 'next/link';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { 
  IconArrowRight, 
  IconBrain, 
  IconRocket, 
  IconChartBar, 
  IconSparkles,
  IconCheck,
  IconUsers,
  IconClock,
  IconShieldLock
} from '@tabler/icons-react';

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] }
};

const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.1
    }
  }
};

export default function LandingPage() {
  const { scrollY } = useScroll();
  const y1 = useTransform(scrollY, [0, 500], [0, 200]);
  const y2 = useTransform(scrollY, [0, 500], [0, -150]);

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden selection:bg-primary/20 selection:text-primary">
      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 glass border-b-0">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-primary/10 p-2 rounded-lg">
              <IconSparkles className="w-5 h-5 text-primary" />
            </div>
            <span className="font-bold text-lg tracking-tight">Capgemini<span className="text-primary">.AI</span></span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/sign-in">
              <Button variant="ghost" className="text-muted-foreground hover:text-foreground hidden sm:flex">Sign In</Button>
            </Link>
            <Link href="/sign-up">
              <Button className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:scale-105">
                Get Started
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden min-h-screen flex flex-col justify-center">
        <div className="absolute inset-0 bg-mesh opacity-40 -z-10 animate-mesh" />
        <div className="absolute inset-0 bg-linear-to-b from-transparent via-background/50 to-background -z-10" />
        
        <div className="container mx-auto px-6 relative z-10">
          <motion.div 
            className="max-w-5xl mx-auto text-center"
            initial="initial"
            animate="animate"
            variants={staggerContainer}
          >
            <motion.div variants={fadeInUp} className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass border border-primary/20 mb-8 shadow-sm hover:border-primary/40 transition-colors cursor-default">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              <span className="text-sm font-medium text-primary">AI-Powered Recruitment Engine 2.0</span>
            </motion.div>

            <motion.h1 
              variants={fadeInUp}
              className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight mb-8 leading-[1.1]"
            >
              Recruit Smarter, <br />
              <span className="text-gradient drop-shadow-sm">Not Harder.</span>
            </motion.h1>

            <motion.p 
              variants={fadeInUp}
              className="text-xl md:text-2xl text-muted-foreground mb-12 max-w-2xl mx-auto leading-relaxed"
            >
              Transform your hiring process with our advanced AI. 
              Automate screening, predict candidate success, and build world-class teams.
            </motion.p>

            <motion.div 
              variants={fadeInUp}
              className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20"
            >
              <Link href="/sign-up" className="w-full sm:w-auto">
                <Button size="lg" className="w-full h-14 text-lg px-8 bg-primary hover:bg-primary/90 shadow-xl shadow-primary/20 transition-all hover:scale-105 hover:-translate-y-1 rounded-xl">
                  Start Free Trial
                  <IconArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
              <Link href="/sign-in" className="w-full sm:w-auto">
                <Button size="lg" variant="outline" className="w-full h-14 text-lg px-8 glass hover:bg-secondary/50 border-primary/20 transition-all hover:scale-105 rounded-xl">
                  View Demo
                </Button>
              </Link>
            </motion.div>

            {/* Abstract UI Preview */}
            <motion.div 
              variants={fadeInUp}
              className="relative w-full max-w-5xl mx-auto h-[300px] md:h-[500px] perspective-1000"
            >
               {/* Decorative Glow */}
               <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3/4 h-3/4 bg-primary/20 blur-[100px] rounded-full pointer-events-none" />

               {/* Main Dashboard Card */}
               <motion.div 
                  style={{ y: y1, rotateX: 5 }}
                  className="absolute inset-x-4 top-0 bottom-10 glass-card rounded-2xl border border-white/10 shadow-2xl overflow-hidden flex flex-col"
               >
                  {/* Fake Browser Header */}
                  <div className="h-10 border-b border-border/50 bg-muted/20 flex items-center px-4 gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-400/80" />
                    <div className="w-3 h-3 rounded-full bg-yellow-400/80" />
                    <div className="w-3 h-3 rounded-full bg-green-400/80" />
                    <div className="ml-4 h-5 w-64 bg-background/50 rounded-full" />
                  </div>
                  {/* Fake UI Content */}
                  <div className="flex-1 p-6 grid grid-cols-12 gap-6 bg-background/30">
                     <div className="col-span-3 hidden md:flex flex-col gap-4">
                        <div className="h-20 rounded-xl bg-card/50 border border-border/30 animate-pulse-slow" />
                        <div className="h-10 rounded-xl bg-card/30 border border-border/30" />
                        <div className="h-10 rounded-xl bg-card/30 border border-border/30" />
                        <div className="h-10 rounded-xl bg-card/30 border border-border/30" />
                     </div>
                     <div className="col-span-12 md:col-span-9 flex flex-col gap-4">
                        <div className="flex gap-4">
                          <div className="h-32 flex-1 rounded-xl bg-primary/10 border border-primary/20 p-4 flex flex-col justify-between">
                             <div className="w-8 h-8 rounded-lg bg-primary/20" />
                             <div className="w-24 h-4 rounded bg-primary/20" />
                          </div>
                          <div className="h-32 flex-1 rounded-xl bg-card/50 border border-border/30 p-4" />
                          <div className="h-32 flex-1 rounded-xl bg-card/50 border border-border/30 p-4" />
                        </div>
                        <div className="flex-1 rounded-xl bg-card/50 border border-border/30 p-4 flex flex-col gap-3">
                           {[1,2,3].map(i => (
                             <div key={i} className="h-12 w-full rounded-lg bg-background/40 border border-border/20 flex items-center px-4 gap-4">
                                <div className="w-8 h-8 rounded-full bg-muted" />
                                <div className="w-32 h-3 rounded bg-muted" />
                                <div className="ml-auto w-16 h-6 rounded-full bg-green-500/20" />
                             </div>
                           ))}
                        </div>
                     </div>
                  </div>
               </motion.div>

               {/* Floating Elements */}
               <motion.div 
                  style={{ y: y2 }}
                  className="absolute -right-4 md:-right-12 top-20 glass p-4 rounded-xl border border-white/20 shadow-xl hidden md:block"
               >
                  <div className="flex items-center gap-3">
                    <div className="bg-green-500/20 p-2 rounded-lg text-green-600">
                      <IconCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Candidate Score</div>
                      <div className="font-bold text-lg">98.5%</div>
                    </div>
                  </div>
               </motion.div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="py-10 border-y border-border/40 bg-muted/30">
        <div className="container mx-auto px-6">
          <p className="text-center text-sm font-medium text-muted-foreground mb-8">TRUSTED BY INNOVATIVE TEAMS WORLDWIDE</p>
          <div className="flex flex-wrap justify-center gap-12 md:gap-20 opacity-50 grayscale hover:grayscale-0 transition-all duration-500">
             {/* Simple Text Placeholders for Logos to avoid external assets */}
             <span className="text-xl font-bold font-mono">ACME Corp</span>
             <span className="text-xl font-bold font-serif">Globex</span>
             <span className="text-xl font-bold font-sans">Soylent</span>
             <span className="text-xl font-bold tracking-tighter">Umbrella</span>
             <span className="text-xl font-bold italic">Cyberdyne</span>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-32 bg-background relative overflow-hidden">
        <div className="container mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-20">
             <h2 className="text-3xl md:text-5xl font-bold mb-6">Everything you need to <span className="text-gradient">hire the best</span></h2>
             <p className="text-xl text-muted-foreground">Comprehensive tools designed to streamline your entire recruitment lifecycle.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <FeatureCard 
              icon={<IconBrain className="w-10 h-10 text-primary" />}
              title="Smart Matching AI"
              description="Our proprietary algorithms analyze thousands of data points to instantly match candidates with the perfect role, reducing bias and improving quality of hire."
              delay={0}
            />
            <FeatureCard 
              icon={<IconRocket className="w-10 h-10 text-indigo-500" />}
              title="Automated Workflows"
              description="Put your hiring on autopilot. From initial screening to interview scheduling, we handle the repetitive tasks so you can focus on the people."
              delay={0.1}
            />
            <FeatureCard 
              icon={<IconChartBar className="w-10 h-10 text-purple-500" />}
              title="Predictive Analytics"
              description="Make decisions based on real data. Visualize pipeline health, forecast hiring needs, and track candidate quality metrics instantly."
              delay={0.2}
            />
            <FeatureCard 
              icon={<IconUsers className="w-10 h-10 text-blue-500" />}
              title="Collaborative Hiring"
              description="Streamline feedback with shared scorecards, @mentions, and real-time activity feeds that keep the whole hiring team aligned."
              delay={0.3}
            />
            <FeatureCard 
              icon={<IconShieldLock className="w-10 h-10 text-emerald-500" />}
              title="Enterprise Security"
              description="Bank-grade encryption, GDPR compliance, and role-based access controls ensure your sensitive candidate data remains protected."
              delay={0.4}
            />
             <FeatureCard 
              icon={<IconClock className="w-10 h-10 text-orange-500" />}
              title="Time-to-Hire Reduction"
              description="Cut your hiring time in half. Our efficiency tools help you move candidates through the pipeline faster without sacrificing quality."
              delay={0.5}
            />
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-32 relative overflow-hidden">
        <div className="absolute inset-0 bg-primary/5 -z-10" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/10 blur-[120px] rounded-full pointer-events-none" />
        
        <div className="container mx-auto px-6 text-center">
          <motion.div
             initial={{ opacity: 0, scale: 0.95 }}
             whileInView={{ opacity: 1, scale: 1 }}
             viewport={{ once: true }}
             transition={{ duration: 0.5 }}
             className="max-w-4xl mx-auto glass p-12 rounded-3xl border-primary/10 shadow-2xl"
          >
            <h2 className="text-4xl md:text-5xl font-bold mb-6">Ready to upgrade your hiring?</h2>
            <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
              Join thousands of modern recruiting teams who are hiring faster and smarter. Start your 14-day free trial today.
            </p>
            <Link href="/sign-up">
              <Button size="lg" className="h-14 px-10 text-lg bg-primary hover:bg-primary/90 shadow-2xl shadow-primary/30 hover:shadow-primary/40 transition-all hover:-translate-y-1 rounded-xl">
                Get Started Now
              </Button>
            </Link>
            <p className="mt-6 text-sm text-muted-foreground">No credit card required. Cancel anytime.</p>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-border/40 bg-background">
        <div className="container mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <IconSparkles className="w-5 h-5 text-primary" />
            <span className="font-semibold">Capgemini.AI</span>
          </div>
          <div className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Capgemini Engineering. All rights reserved.
          </div>
          <div className="flex gap-6">
            <Link href="#" className="text-sm text-muted-foreground hover:text-primary transition-colors">Privacy</Link>
            <Link href="#" className="text-sm text-muted-foreground hover:text-primary transition-colors">Terms</Link>
            <Link href="#" className="text-sm text-muted-foreground hover:text-primary transition-colors">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description, delay }: { icon: React.ReactNode, title: string, description: string, delay: number }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay }}
      className="p-8 rounded-2xl glass-card hover:bg-card/50 transition-all duration-300 border border-border/50 group hover:border-primary/20 hover:shadow-lg hover:shadow-primary/5"
    >
      <div className="mb-6 p-4 rounded-xl bg-background/50 w-fit group-hover:scale-110 transition-transform duration-300 border border-border/50 shadow-sm">
        {icon}
      </div>
      <h3 className="text-xl font-bold mb-3 group-hover:text-primary transition-colors">{title}</h3>
      <p className="text-muted-foreground leading-relaxed">
        {description}
      </p>
    </motion.div>
  );
}
