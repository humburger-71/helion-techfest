import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
import Manifesto from "@/components/Manifesto";
import Ecosystem from "@/components/Ecosystem";
import Arenas from "@/components/Arenas";
import Timeline from "@/components/Timeline";
import Partners from "@/components/Partners";
import Register from "@/components/Register";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Manifesto />
        <Ecosystem />
        <Arenas />
        <Timeline />
        <Partners />
        <Register />
      </main>
      <Footer />
    </>
  );
}
