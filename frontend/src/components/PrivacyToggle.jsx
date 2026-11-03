import React from 'react';
import { IconEye, IconEyeOff } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { usePrivacy } from '@/context/PrivacyContext';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function PrivacyToggle() {
  const { isPrivate, togglePrivacy } = usePrivacy();

  return (
    <Tooltip>
      <TooltipTrigger render={
        <Button
          onClick={togglePrivacy}
          variant="ghost"
          size="icon"
          className="relative cursor-pointer text-muted-foreground hover:text-foreground"
          aria-label={isPrivate ? 'Show payments and amounts' : 'Hide payments and amounts'}
        >
          {isPrivate ? (
            <IconEyeOff className="h-[1.15rem] w-[1.15rem] text-primary transition-transform duration-200" />
          ) : (
            <IconEye className="h-[1.15rem] w-[1.15rem] stroke-[1.75] transition-transform duration-200" />
          )}
          <span className="sr-only">Toggle Privacy Mode</span>
        </Button>
      } />
      <TooltipContent side="bottom">
        <p>{isPrivate ? 'Show amounts & payments' : 'Hide amounts & payments'}</p>
      </TooltipContent>
    </Tooltip>
  );
}

export default PrivacyToggle;
