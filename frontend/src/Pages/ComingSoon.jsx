import React from 'react';
import { IconMoodSmileBeam } from '@tabler/icons-react';

const ComingSoon = () => {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[70vh] text-center px-4 animate-in zoom-in-95 duration-500">
      <div>
       <h1 className='text-[130px]'>😊</h1>
      </div>
      <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4">
        Coming Soon! 🚀
      </h1>
      <p className="text-xl text-muted-foreground max-w-md mx-auto">
        This page is currently under development. Hang tight, we're building something awesome here.
      </p>
    </div>
  );
};

export default ComingSoon;