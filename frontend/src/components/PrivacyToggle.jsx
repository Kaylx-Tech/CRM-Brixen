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
          className="relative size-7 cursor-pointer rounded-full hover:bg-muted"
          aria-label={isPrivate ? 'Show payments and amounts' : 'Hide payments and amounts'}
        >
          {isPrivate ? (
            <IconEyeOff className="size-[15px] stroke-[1.75] text-primary transition-transform duration-200" />
          ) : (
            <IconEye className="size-[15px] stroke-[1.75] text-muted-foreground transition-transform duration-200" />
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
