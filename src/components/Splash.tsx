import React from 'react';
import { motion } from 'motion/react';

export default function Splash() {
  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="text-center"
      >
        <h1 className="text-6xl font-black text-[#32befa] mb-2 tracking-tighter">
          Rahee
        </h1>
        <h2 className="text-2xl font-bold text-white tracking-widest uppercase">
          Quiz
        </h2>
      </motion.div>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: 200 }}
        transition={{ delay: 0.5, duration: 1.5 }}
        className="h-1 bg-[#32befa] mt-8 rounded-full"
      />
    </div>
  );
}
