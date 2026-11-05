import React, {useEffect, useId, useRef} from 'react';
import {X} from 'lucide-react';

export default function Modal({title,children,onClose,className=''}) {
  const ref=useRef(null), titleId=useId();
  useEffect(()=>{
    const previous=document.activeElement;
    const overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    ref.current.showModal();
    return()=>{document.body.style.overflow=overflow;previous?.focus();};
  },[]);
  return <dialog className={className} aria-labelledby={titleId} ref={ref} onCancel={onClose} onClick={event=>{if(event.target===event.currentTarget)onClose();}}><div className="modal-head"><h2 id={titleId}>{title}</h2><button className="icon-button" onClick={onClose} aria-label="关闭"><X size={20}/></button></div>{children}</dialog>;
}
